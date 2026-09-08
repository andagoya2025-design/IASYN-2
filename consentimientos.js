/* =====================================================
   IASYN ERP - MÓDULO DE CONSENTIMIENTOS
   Archivo: consentimientos.js
   Versión: 1.2 autonomía institucional y multimédico
   Actualización: identidad dinámica del centro, médico y especialidad
   Compatibilidad: conserva window.auroConsentimientos
===================================================== */

window.auroConsentimientos = {

    plantillas: {

        consultaGinecologica: `
            <div class="consentimiento-documento">

                <h2 style="text-align:center; margin-bottom:4px;">
                    CONSENTIMIENTO INFORMADO
                </h2>

                <h3 style="text-align:center; margin-top:0;">
                    CONSULTA GINECOLÓGICA
                </h3>

                <hr>

                <p>
                    Yo, <strong>{{PACIENTE}}</strong>,
                    con documento de identidad N.°
                    <strong>{{CEDULA}}</strong>,
                    manifiesto que he recibido información clara,
                    suficiente y comprensible sobre la atención médica
                    ginecológica que se realizará en {{CENTRO}}.
                </p>

                <p>
                    Comprendo que la consulta podrá incluir, según criterio médico
                    y previa explicación, procedimientos propios de la especialidad,
                    tales como:
                </p>

                <ul>
                    <li>Anamnesis médica y revisión de antecedentes.</li>
                    <li>Examen físico general.</li>
                    <li>Examen ginecológico, cuando esté indicado.</li>
                    <li>Evaluación mamaria, cuando corresponda.</li>
                    <li>Solicitud, revisión e interpretación de exámenes complementarios.</li>
                    <li>Orientación diagnóstica, terapéutica y preventiva.</li>
                </ul>

                <p><strong>Declaro que:</strong></p>

                <ol>
                    <li>
                        He tenido la oportunidad de realizar preguntas, las cuales
                        han sido respondidas de forma satisfactoria.
                    </li>
                    <li>
                        Comprendo los objetivos, beneficios, limitaciones y posibles
                        molestias derivadas de la valoración médica.
                    </li>
                    <li>
                        Entiendo que puedo aceptar o rechazar procedimientos no urgentes
                        y retirar mi consentimiento antes de su realización.
                    </li>
                    <li>
                        Autorizo el registro de mi información clínica en la historia
                        clínica institucional, bajo estricta confidencialidad y conforme
                        a la normativa sanitaria vigente.
                    </li>
                    <li>
                        Reconozco que la práctica médica no garantiza resultados
                        específicos y que las decisiones diagnósticas y terapéuticas
                        se fundamentan en criterios científicos y clínicos.
                    </li>
                </ol>

                <p>
                    En forma libre, voluntaria y consciente, otorgo mi consentimiento
                    para la realización de la presente consulta médica.
                </p>

                <br><br>

                <table style="width:100%; margin-top:40px;">
                    <tr>
                        <td style="text-align:center; width:33%;">
                            ___________________________<br>
                            Firma del Paciente
                        </td>

                        <td style="text-align:center; width:33%;">
                            ___________________________<br>
                            Firma del Representante Legal<br>
                            <span style="font-size:12px;">Si aplica</span>
                        </td>

                        <td style="text-align:center; width:33%;">
                            ___________________________<br>
                            Médico Tratante<br>
                            {{MEDICO}}<br>
                            <span style="font-size:12px;">{{ESPECIALIDAD}}</span>
                        </td>
                    </tr>
                </table>

                <br><br>

                <p>
                    <strong>Fecha:</strong> {{FECHA}}
                </p>

            </div>
        `
    },

    _texto(valor) {
        return String(valor === null || valor === undefined ? '' : valor)
            .replace(/\s+/g, ' ')
            .trim();
    },

    _idMedico(registro) {
        registro = registro || {};
        return this._texto(
            registro.id_medico ||
            registro.medico_id ||
            registro.id ||
            registro.codigo ||
            ''
        );
    },

    _nombreMedico(registro) {
        registro = registro || {};
        return this._texto(
            registro.nombre_completo ||
            registro.medico_nombre ||
            registro.nombre ||
            ((registro.nombres || '') + ' ' + (registro.apellidos || '')) ||
            ''
        );
    },

    _especialidadMedico(registro) {
        registro = registro || {};
        return this._texto(
            registro.especialidad_principal ||
            registro.especialidad ||
            registro.medico_especialidad ||
            ''
        );
    },

    _obtenerAtencionActiva() {
        try {
            if (typeof window.getAtencionActiva === 'function') {
                const atencion = window.getAtencionActiva();
                if (atencion && (atencion.id_atencion || atencion.id)) return atencion;
            }
        } catch (error) {
            console.warn('IASYN CONSENTIMIENTOS: no se pudo obtener la atención activa.', error);
        }
        return null;
    },

    _buscarMedicoPorId(idMedico) {
        const id = this._texto(idMedico);
        if (!id) return null;

        const listas = [
            window.medicos,
            window.medicosActivos,
            window.listaMedicos,
            window.configuracionMedicos,
            window.medicosConfiguracion
        ].filter(Array.isArray);

        for (const lista of listas) {
            const medico = lista.find(item => this._idMedico(item) === id);
            if (medico) return medico;
        }

        try {
            if (typeof window.getMedicoActivo === 'function') {
                const medicoActivo = window.getMedicoActivo();
                if (this._idMedico(medicoActivo) === id) return medicoActivo;
            }
        } catch (error) {
            console.warn('IASYN CONSENTIMIENTOS: no se pudo consultar el médico activo.', error);
        }

        return null;
    },

    _resolverCentro(datos) {
        const directo = this._texto(
            datos.CENTRO ||
            datos.NOMBRE_CENTRO ||
            datos.centro ||
            datos.nombre_centro ||
            ''
        );
        if (directo) return directo;

        const configuraciones = [
            window.configuracionCentro,
            window.IASYN_CONFIG_CENTRO,
            window.configCentro
        ].filter(item => item && typeof item === 'object');

        for (const cfg of configuraciones) {
            const nombre = this._texto(
                cfg.nombre_centro ||
                cfg.nombre ||
                cfg.razon_social ||
                cfg.nombre_comercial ||
                ''
            );
            if (nombre) return nombre;
        }

        const sidebar = document.getElementById('auroNombreCentroSidebar');
        const nombreSidebar = this._texto(sidebar && sidebar.textContent);
        if (nombreSidebar) return nombreSidebar;

        return 'Centro médico';
    },

    _resolverIdentidadMedico(datos) {
        const atencion = this._obtenerAtencionActiva() || {};

        const idMedico = this._texto(
            datos.ID_MEDICO ||
            datos.id_medico ||
            atencion.id_medico ||
            atencion.medico_id ||
            ''
        );

        const registro = this._buscarMedicoPorId(idMedico);

        const medico = this._texto(
            datos.MEDICO ||
            datos.MEDICO_TRATANTE ||
            datos.medico ||
            datos.medico_tratante ||
            this._nombreMedico(registro) ||
            atencion.medico_nombre ||
            atencion.medico ||
            ''
        );

        const especialidad = this._texto(
            datos.ESPECIALIDAD ||
            datos.especialidad ||
            this._especialidadMedico(registro) ||
            atencion.especialidad ||
            atencion.especialidad_principal ||
            ''
        );

        return {
            id_medico: idMedico,
            medico: medico || 'Profesional tratante',
            especialidad: especialidad || 'Especialidad médica'
        };
    },

    _resolverDatos(datos = {}) {
        const salida = Object.assign({}, datos);
        const identidad = this._resolverIdentidadMedico(salida);

        if (!this._texto(salida.CENTRO)) salida.CENTRO = this._resolverCentro(salida);
        if (!this._texto(salida.MEDICO)) salida.MEDICO = identidad.medico;
        if (!this._texto(salida.ESPECIALIDAD)) salida.ESPECIALIDAD = identidad.especialidad;
        if (!this._texto(salida.ID_MEDICO) && identidad.id_medico) salida.ID_MEDICO = identidad.id_medico;

        return salida;
    },

    generar(tipo, datos = {}) {

        let plantilla = this.plantillas[tipo];

        if (!plantilla) {
            console.error('Plantilla no encontrada');
            return '';
        }

        const datosResueltos = this._resolverDatos(datos);

        Object.keys(datosResueltos).forEach(key => {
            plantilla = plantilla.replaceAll(`{{${key}}}`, datosResueltos[key] || '');
        });

        return plantilla;
    }
};

/* Alias IASYN compatible: no elimina el contrato histórico. */
window.IASYN_CONSENTIMIENTOS = window.auroConsentimientos;

/* PRUEBA EN CONSOLA
auroConsentimientos.generar('consultaGinecologica',{PACIENTE:'PACIENTE DEMO',CEDULA:'1234567890',FECHA:'26/06/2026'});
*/
