/***********************************************************************
 IASYN ERP
 Archivo: catalogo_medicamentos.js
 Módulo: Catálogo Maestro de Medicamentos
 Versión: 1.4.0-IASYN2
 Fecha de adaptación: 2026-09-08

 OBJETIVO ANTIRREGRESIVO / AISLAMIENTO IASYN
 - Conservar EXACTAMENTE los 15 medicamentos base actuales de plan.js.
 - Ampliar el catálogo sin alterar el contrato clínico persistido:
   med, pres, via, cantidad, frec, dur, ind, continuo.
 - Exponer como API principal: window.IASYN_CATALOGO_MEDICAMENTOS.
 - Usar como colección principal: window.MEDICAMENTOS_IASYN_BASE.
 - Mantener aliases AUROSANAX únicamente como compatibilidad contractual
   mientras existan consumidores heredados dentro del mismo ERP IASYN.
 - NO guardar datos.
 - NO crear ni modificar id_atencion, id_paciente, id_historia ni id_cita.
 - NO escribir Google Sheets, Drive ni Apps Script.
 - NO guardar Plan, Recetas ni Diagnósticos.
 - NO realizar solicitudes de red.
 - El catálogo ASISTE; el profesional decide.
************************************************************************/

(function(){
    'use strict';

    const CATALOGO_IASYN = [

        /* ============================================================
           BASE ESTABLE HEREDADA DE plan.js
           Estos 15 registros conservan EXACTAMENTE su comportamiento.
        ============================================================ */

        {
            cat:'GINECOLOGÍA',
            med:'Tinidazol',
            principio_activo:'Tinidazol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta',
            concentracion:'500 mg',
            pres:'500 mg tableta',
            via:'VO',
            frec:'según esquema médico',
            dur:'según indicación',
            ind:'Tomar después de alimentos'
        },

        {
            cat:'GINECOLOGÍA',
            med:'Metronidazol',
            principio_activo:'Metronidazol',
            denominaciones_comerciales:[],
            nombres_alternativos:['Metronidazole'],
            forma_farmaceutica:'Tableta',
            concentracion:'500 mg',
            pres:'500 mg tableta',
            via:'VO',
            frec:'cada 12 horas',
            dur:'7 días',
            ind:'Tomar después de alimentos'
        },

        {
            cat:'GINECOLOGÍA',
            med:'Clotrimazol',
            principio_activo:'Clotrimazol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Óvulo vaginal',
            concentracion:'',
            pres:'óvulo vaginal',
            via:'Vaginal',
            frec:'cada noche',
            dur:'7 noches',
            ind:'Aplicar antes de dormir'
        },

        {
            cat:'GINECOLOGÍA',
            med:'Fluconazol',
            principio_activo:'Fluconazol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula',
            concentracion:'150 mg',
            pres:'150 mg cápsula',
            via:'VO',
            frec:'dosis única',
            dur:'1 día',
            ind:'Según indicación médica'
        },

        {
            cat:'GINECOLOGÍA',
            med:'Secnidazol',
            principio_activo:'Secnidazol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta',
            concentracion:'1 g',
            pres:'1 g tableta',
            via:'VO',
            frec:'dosis única',
            dur:'1 día',
            ind:'Tomar después de alimentos'
        },

        {
            cat:'DOLOR / INFLAMACIÓN',
            med:'Ibuprofeno',
            principio_activo:'Ibuprofeno',
            denominaciones_comerciales:[],
            nombres_alternativos:['Ibuprofen'],
            forma_farmaceutica:'Tableta',
            concentracion:'400 mg',
            pres:'400 mg tableta',
            via:'VO',
            frec:'cada 8 horas',
            dur:'3 a 5 días',
            ind:'Tomar después de alimentos'
        },

        {
            cat:'DOLOR / INFLAMACIÓN',
            med:'Paracetamol',
            principio_activo:'Paracetamol',
            denominaciones_comerciales:[],
            nombres_alternativos:['Acetaminofén','Acetaminophen'],
            forma_farmaceutica:'Tableta',
            concentracion:'500 mg',
            pres:'500 mg tableta',
            via:'VO',
            frec:'cada 8 horas',
            dur:'3 a 5 días',
            ind:'Si dolor o fiebre'
        },

        {
            cat:'DOLOR / INFLAMACIÓN',
            med:'Ketorolaco',
            principio_activo:'Ketorolaco',
            denominaciones_comerciales:[],
            nombres_alternativos:['Ketorolac'],
            forma_farmaceutica:'Tableta',
            concentracion:'10 mg',
            pres:'10 mg tableta',
            via:'VO',
            frec:'cada 8 horas',
            dur:'máximo 3 días',
            ind:'Tomar después de alimentos'
        },

        {
            cat:'MEDICINA GENERAL',
            med:'Amoxicilina + ácido clavulánico',
            principio_activo:'Amoxicilina + ácido clavulánico',
            denominaciones_comerciales:[],
            nombres_alternativos:[
                'Amoxicilina ácido clavulánico',
                'Amoxicillin clavulanate'
            ],
            forma_farmaceutica:'Tableta',
            concentracion:'875/125 mg',
            pres:'875/125 mg tableta',
            via:'VO',
            frec:'cada 12 horas',
            dur:'7 días',
            ind:'Tomar con alimentos'
        },

        {
            cat:'MEDICINA GENERAL',
            med:'Cefalexina',
            principio_activo:'Cefalexina',
            denominaciones_comerciales:[],
            nombres_alternativos:['Cephalexin'],
            forma_farmaceutica:'Cápsula',
            concentracion:'500 mg',
            pres:'500 mg cápsula',
            via:'VO',
            frec:'cada 6 horas',
            dur:'7 días',
            ind:''
        },

        {
            cat:'DERMATOLOGÍA / ESTÉTICA',
            med:'Mupirocina',
            principio_activo:'Mupirocina',
            denominaciones_comerciales:[],
            nombres_alternativos:['Mupirocin'],
            forma_farmaceutica:'Ungüento',
            concentracion:'',
            pres:'ungüento',
            via:'Tópica',
            frec:'cada 8 horas',
            dur:'5 a 7 días',
            ind:'Aplicar capa fina'
        },

        {
            cat:'DERMATOLOGÍA / ESTÉTICA',
            med:'Ácido fusídico',
            principio_activo:'Ácido fusídico',
            denominaciones_comerciales:[],
            nombres_alternativos:['Fusidic acid'],
            forma_farmaceutica:'Crema',
            concentracion:'',
            pres:'crema',
            via:'Tópica',
            frec:'cada 8 horas',
            dur:'7 días',
            ind:'Aplicar capa fina'
        },

        {
            cat:'DERMATOLOGÍA / ESTÉTICA',
            med:'Hidrocortisona',
            principio_activo:'Hidrocortisona',
            denominaciones_comerciales:[],
            nombres_alternativos:['Hydrocortisone'],
            forma_farmaceutica:'Crema',
            concentracion:'1%',
            pres:'1% crema',
            via:'Tópica',
            frec:'cada 12 horas',
            dur:'3 a 5 días',
            ind:'Aplicar capa fina'
        },

        {
            cat:'UROLOGÍA',
            med:'Fenazopiridina',
            principio_activo:'Fenazopiridina',
            denominaciones_comerciales:[],
            nombres_alternativos:['Phenazopyridine'],
            forma_farmaceutica:'Tableta',
            concentracion:'100 mg',
            pres:'100 mg tableta',
            via:'VO',
            frec:'cada 8 horas',
            dur:'2 días',
            ind:'Uso sintomático según indicación'
        },

        {
            cat:'OTROS',
            med:'Probióticos',
            principio_activo:'Probióticos',
            denominaciones_comerciales:[],
            nombres_alternativos:['Probiotics'],
            forma_farmaceutica:'Cápsula / sobre',
            concentracion:'',
            pres:'cápsula/sobre',
            via:'VO',
            frec:'cada día',
            dur:'10 a 30 días',
            ind:''
        },

        /* ============================================================
           CATÁLOGO AMPLIADO
           Registros de apoyo: NO constituyen prescripción automática.
        ============================================================ */

        {
            cat:'GINECOLOGÍA',
            med:'Miconazol',
            principio_activo:'Miconazol',
            denominaciones_comerciales:[],
            nombres_alternativos:['Miconazole'],
            forma_farmaceutica:'Óvulo vaginal',
            concentracion:'según presentación registrada',
            pres:'óvulo vaginal',
            via:'Vaginal',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },
        {
            cat:'GINECOLOGÍA',
            med:'Nistatina',
            principio_activo:'Nistatina',
            denominaciones_comerciales:[],
            nombres_alternativos:['Nystatin'],
            forma_farmaceutica:'Óvulo vaginal',
            concentracion:'según presentación registrada',
            pres:'óvulo vaginal',
            via:'Vaginal',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },
        {
            cat:'GINECOLOGÍA',
            med:'Clindamicina',
            principio_activo:'Clindamicina',
            denominaciones_comerciales:[],
            nombres_alternativos:['Clindamicina vaginal'],
            forma_farmaceutica:'Crema vaginal',
            concentracion:'según presentación registrada',
            pres:'crema vaginal',
            via:'Vaginal',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },
        {
            cat:'ANTIINFECCIOSOS',
            med:'Azitromicina',
            principio_activo:'Azitromicina',
            denominaciones_comerciales:[],
            nombres_alternativos:['Azithromycin'],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },
        {
            cat:'ANTIINFECCIOSOS',
            med:'Doxiciclina',
            principio_activo:'Doxiciclina',
            denominaciones_comerciales:[],
            nombres_alternativos:['Doxycycline'],
            forma_farmaceutica:'Tableta / cápsula',
            concentracion:'según presentación registrada',
            pres:'tableta / cápsula',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },
        {
            cat:'ANTIINFECCIOSOS',
            med:'Ceftriaxona',
            principio_activo:'Ceftriaxona',
            denominaciones_comerciales:[],
            nombres_alternativos:['Ceftriaxone'],
            forma_farmaceutica:'Sólido parenteral',
            concentracion:'500 mg y 1.000 mg',
            pres:'500 mg / 1.000 mg sólido parenteral',
            via:'Parenteral',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Seleccionar dosis y esquema según diagnóstico, gravedad y condiciones clínicas'
        },
        {
            cat:'UROLOGÍA',
            med:'Nitrofurantoína',
            principio_activo:'Nitrofurantoína',
            denominaciones_comerciales:[],
            nombres_alternativos:['Nitrofurantoin'],
            forma_farmaceutica:'Cápsula',
            concentracion:'100 mg',
            pres:'100 mg cápsula',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },
        {
            cat:'UROLOGÍA',
            med:'Fosfomicina trometamol',
            principio_activo:'Fosfomicina trometamol',
            denominaciones_comerciales:[],
            nombres_alternativos:['Fosfomicina','Fosfomycin trometamol'],
            forma_farmaceutica:'Sobre granulado',
            concentracion:'3 g',
            pres:'3 g sobre granulado',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },
        {
            cat:'ANALGÉSICOS',
            med:'Naproxeno',
            principio_activo:'Naproxeno',
            denominaciones_comerciales:[],
            nombres_alternativos:['Naproxen'],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },
        {
            cat:'ANTIESPASMÓDICOS',
            med:'Butilbromuro de hioscina',
            principio_activo:'Butilbromuro de hioscina',
            denominaciones_comerciales:[],
            nombres_alternativos:['Hioscina butilbromuro','Hyoscine butylbromide'],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },
        {
            cat:'MEDICINA GENERAL',
            med:'Losartán',
            principio_activo:'Losartán',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según evaluación clínica',
            dur:'según control',
            ind:'Individualizar según condición clínica'
        },
        {
            cat:'MEDICINA GENERAL',
            med:'Enalapril',
            principio_activo:'Enalapril',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según evaluación clínica',
            dur:'según control',
            ind:'Individualizar según condición clínica'
        },
        {
            cat:'MEDICINA GENERAL',
            med:'Amlodipino',
            principio_activo:'Amlodipino',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según evaluación clínica',
            dur:'según control',
            ind:'Individualizar según condición clínica'
        },
        {
            cat:'ENDOCRINOLOGÍA / GINECOLOGÍA',
            med:'Metformina',
            principio_activo:'Metformina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según evaluación clínica',
            dur:'según control',
            ind:'Individualizar según diagnóstico y tolerancia'
        },
        {
            cat:'GINECOLOGÍA / OBSTETRICIA',
            med:'Ácido fólico',
            principio_activo:'Ácido fólico',
            denominaciones_comerciales:[],
            nombres_alternativos:['Folic acid'],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según objetivo clínico',
            dur:'según indicación',
            ind:'Seleccionar presentación y pauta según objetivo clínico'
        },
        {
            cat:'GINECOLOGÍA',
            med:'Espironolactona',
            principio_activo:'Espironolactona',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según control',
            ind:'Usar bajo criterio médico'
        },
        {
            cat:'GINECOLOGÍA',
            med:'Medroxiprogesterona',
            principio_activo:'Medroxiprogesterona',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta / inyectable',
            concentracion:'según presentación registrada',
            pres:'según presentación',
            via:'',
            frec:'según esquema clínico',
            dur:'según indicación',
            ind:'Seleccionar presentación, vía y esquema según criterio médico'
        },
        {
            cat:'GINECOLOGÍA',
            med:'Letrozol',
            principio_activo:'Letrozol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según esquema reproductivo',
            dur:'según esquema',
            ind:'Usar únicamente bajo indicación médica'
        },
        {
            cat:'GINECOLOGÍA',
            med:'Ácido tranexámico',
            principio_activo:'Ácido tranexámico',
            denominaciones_comerciales:[],
            nombres_alternativos:['Tranexamic acid'],
            forma_farmaceutica:'Tableta / inyectable',
            concentracion:'según presentación registrada',
            pres:'según presentación',
            via:'',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Seleccionar presentación y pauta según situación clínica'
        },
        {
            cat:'GINECOLOGÍA',
            med:'Anticonceptivo hormonal combinado',
            principio_activo:'Anticonceptivo hormonal combinado',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta',
            concentracion:'según formulación',
            pres:'tableta',
            via:'VO',
            frec:'según esquema',
            dur:'según indicación',
            ind:'Seleccionar formulación según evaluación clínica'
        },
        {
            cat:'GINECOLOGÍA',
            med:'Progestágeno',
            principio_activo:'Progestágeno',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'según formulación',
            concentracion:'según presentación registrada',
            pres:'según presentación',
            via:'',
            frec:'según esquema',
            dur:'según indicación',
            ind:'Seleccionar principio activo, presentación y vía según criterio médico'
        },
        {
            cat:'MEDICINA GENERAL',
            med:'Hierro oral',
            principio_activo:'Hierro oral',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta / cápsula',
            concentracion:'según presentación registrada',
            pres:'tableta/cápsula',
            via:'VO',
            frec:'según evaluación clínica',
            dur:'según control',
            ind:'Seleccionar formulación según diagnóstico y tolerancia'
        },
        {
            cat:'DOLOR / INFLAMACIÓN',
            med:'Pregabalina',
            principio_activo:'Pregabalina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula',
            concentracion:'según presentación registrada',
            pres:'cápsula',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },
        {
            cat:'DOLOR / INFLAMACIÓN',
            med:'Gabapentina',
            principio_activo:'Gabapentina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula',
            concentracion:'según presentación registrada',
            pres:'cápsula',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },
        {
            cat:'DOLOR / INFLAMACIÓN',
            med:'Amitriptilina',
            principio_activo:'Amitriptilina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },
        {
            cat:'DOLOR / INFLAMACIÓN',
            med:'Duloxetina',
            principio_activo:'Duloxetina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula',
            concentracion:'según presentación registrada',
            pres:'cápsula',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },
        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Magnesio glicinato',
            principio_activo:'Magnesio glicinato',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula/polvo',
            concentracion:'según presentación registrada',
            pres:'cápsula/polvo',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },
        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Zinc',
            principio_activo:'Zinc',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/cápsula',
            concentracion:'según presentación registrada',
            pres:'tableta/cápsula',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },
        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Selenio',
            principio_activo:'Selenio',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/cápsula',
            concentracion:'según presentación registrada',
            pres:'tableta/cápsula',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },
        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Vitamina C',
            principio_activo:'Vitamina C',
            denominaciones_comerciales:[],
            nombres_alternativos:['Ácido ascórbico'],
            forma_farmaceutica:'Tableta/cápsula',
            concentracion:'según presentación registrada',
            pres:'tableta/cápsula',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },
        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Vitamina E',
            principio_activo:'Vitamina E',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula',
            concentracion:'según presentación registrada',
            pres:'cápsula',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        }
    ];

    /* ============================================================
       VARIANTES ENRIQUECIDAS
       - Solo recomienda opciones conocidas.
       - No impide seleccionar/escribir otra presentación o vía.
    ============================================================ */

    const VARIANTES_IASYN = {
        'metronidazol': [
            {forma_farmaceutica:'Tableta', concentracion:'500 mg', pres:'500 mg tableta', vias_compatibles:['VO'], estado:'ACTIVO'},
            {forma_farmaceutica:'Óvulo vaginal', concentracion:'según presentación registrada', pres:'óvulo vaginal', vias_compatibles:['Vaginal'], estado:'ACTIVO'}
        ],
        'clotrimazol': [
            {forma_farmaceutica:'Óvulo vaginal', concentracion:'según presentación registrada', pres:'óvulo vaginal', vias_compatibles:['Vaginal'], estado:'ACTIVO'},
            {forma_farmaceutica:'Crema', concentracion:'según presentación registrada', pres:'crema', vias_compatibles:['Tópica','Vaginal'], estado:'ACTIVO'}
        ],
        'fluconazol': [
            {forma_farmaceutica:'Cápsula', concentracion:'150 mg', pres:'150 mg cápsula', vias_compatibles:['VO'], estado:'ACTIVO'}
        ],
        'ceftriaxona': [
            {forma_farmaceutica:'Sólido parenteral', concentracion:'500 mg', pres:'500 mg sólido parenteral', vias_compatibles:['IM','IV'], estado:'ACTIVO'},
            {forma_farmaceutica:'Sólido parenteral', concentracion:'1.000 mg', pres:'1.000 mg sólido parenteral', vias_compatibles:['IM','IV'], estado:'ACTIVO'}
        ],
        'medroxiprogesterona': [
            {forma_farmaceutica:'Tableta', concentracion:'según presentación registrada', pres:'tableta', vias_compatibles:['VO'], estado:'ACTIVO'},
            {forma_farmaceutica:'Inyectable', concentracion:'según presentación registrada', pres:'inyectable', vias_compatibles:['IM'], estado:'ACTIVO'}
        ],
        'acido tranexamico': [
            {forma_farmaceutica:'Tableta', concentracion:'según presentación registrada', pres:'tableta', vias_compatibles:['VO'], estado:'ACTIVO'},
            {forma_farmaceutica:'Inyectable', concentracion:'según presentación registrada', pres:'inyectable', vias_compatibles:['IV'], estado:'ACTIVO'}
        ]
    };

    function texto(v){
        return String(v ?? '').trim();
    }

    function normalizar(v){
        return texto(v)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g,'')
            .replace(/[^\p{L}\p{N}]+/gu,' ')
            .replace(/\s+/g,' ')
            .trim();
    }

    function arrayTexto(v){
        if(Array.isArray(v)){
            return v.map(texto).filter(Boolean);
        }
        if(v === null || v === undefined || v === '') return [];
        return [texto(v)].filter(Boolean);
    }

    function clonarVariantes(lista){
        return (Array.isArray(lista) ? lista : []).map(function(v){
            return {
                forma_farmaceutica:texto(v.forma_farmaceutica),
                concentracion:texto(v.concentracion),
                pres:texto(v.pres),
                vias_compatibles:arrayTexto(v.vias_compatibles),
                estado:texto(v.estado)
            };
        });
    }

    function normalizarRegistro(m){
        m = m || {};
        const clave = normalizar(m.principio_activo || m.med);
        const variantesPropias =
            Array.isArray(m.variantes) ? m.variantes : VARIANTES_IASYN[clave];

        return {
            cat: texto(m.cat),
            med: texto(m.med),
            principio_activo: texto(m.principio_activo || m.med),
            denominaciones_comerciales: arrayTexto(m.denominaciones_comerciales),
            nombres_alternativos: arrayTexto(m.nombres_alternativos),
            forma_farmaceutica: texto(m.forma_farmaceutica),
            concentracion: texto(m.concentracion),
            pres: texto(m.pres),
            via: texto(m.via),
            frec: texto(m.frec),
            dur: texto(m.dur),
            ind: texto(m.ind),
            variantes: clonarVariantes(variantesPropias),
            clasificacion: texto(m.clasificacion)
        };
    }

    function firmaMedicamento(m){
        return [
            normalizar(m.med),
            normalizar(m.pres),
            normalizar(m.via)
        ].join('|');
    }

    function fusionarSinDuplicados(lista){
        const mapa = new Map();

        (lista || []).forEach(function(item){
            const m = normalizarRegistro(item);
            if(!m.med) return;

            const firma = firmaMedicamento(m);

            if(!mapa.has(firma)){
                mapa.set(firma, m);
                return;
            }

            const actual = mapa.get(firma);

            actual.denominaciones_comerciales =
                Array.from(new Set([
                    ...actual.denominaciones_comerciales,
                    ...m.denominaciones_comerciales
                ]));

            actual.nombres_alternativos =
                Array.from(new Set([
                    ...actual.nombres_alternativos,
                    ...m.nombres_alternativos
                ]));

            if(!actual.variantes.length && m.variantes.length){
                actual.variantes = clonarVariantes(m.variantes);
            }
        });

        return Array.from(mapa.values());
    }

    const existentesIASYN =
        Array.isArray(window.MEDICAMENTOS_IASYN_BASE)
            ? window.MEDICAMENTOS_IASYN_BASE
            : [];

    window.MEDICAMENTOS_IASYN_BASE =
        fusionarSinDuplicados([
            ...CATALOGO_IASYN,
            ...existentesIASYN
        ]);

    const API_IASYN = {

        version:'1.4.0-IASYN2',

        obtenerTodos:function(){
            return window.MEDICAMENTOS_IASYN_BASE.slice();
        },

        cantidad:function(){
            return window.MEDICAMENTOS_IASYN_BASE.length;
        },

        obtenerVariantes:function(medicamento){
            const q = normalizar(medicamento);

            const item = window.MEDICAMENTOS_IASYN_BASE.find(function(m){
                return normalizar(m.med) === q ||
                    normalizar(m.principio_activo) === q;
            });

            return item ? clonarVariantes(item.variantes) : [];
        },

        obtenerViasCompatibles:function(medicamento, presentacion){
            const variantes = this.obtenerVariantes(medicamento);
            const p = normalizar(presentacion);

            const variante = variantes.find(function(v){
                return normalizar(v.pres) === p;
            });

            return variante ? arrayTexto(variante.vias_compatibles) : [];
        },

        buscar:function(consulta){
            const q = normalizar(consulta);

            if(!q){
                return window.MEDICAMENTOS_IASYN_BASE.slice();
            }

            return window.MEDICAMENTOS_IASYN_BASE.filter(function(m){

                const textoBusqueda = [
                    m.med,
                    m.principio_activo,
                    m.pres,
                    m.forma_farmaceutica,
                    m.concentracion,
                    m.cat,
                    ...(m.denominaciones_comerciales || []),
                    ...(m.nombres_alternativos || []),
                    ...((m.variantes || []).flatMap(function(v){
                        return [
                            v.pres,
                            v.forma_farmaceutica,
                            v.concentracion,
                            ...(v.vias_compatibles || [])
                        ];
                    }))
                ].join(' ');

                return normalizar(textoBusqueda).includes(q);
            });
        }
    };

    window.IASYN_CATALOGO_MEDICAMENTOS = API_IASYN;

    /*
      COMPATIBILIDAD CONTRACTUAL TEMPORAL:
      cie10_inteligente.js y otros consumidores históricos pueden seguir
      consultando estos nombres. El alias apunta a los datos LOCALES de IASYN;
      no existe conexión con Aurosanax Prueba.
    */
    window.MEDICAMENTOS_AUROSANAX_BASE = window.MEDICAMENTOS_IASYN_BASE;
    window.AUROSANAX_CATALOGO_MEDICAMENTOS = window.IASYN_CATALOGO_MEDICAMENTOS;

})();
