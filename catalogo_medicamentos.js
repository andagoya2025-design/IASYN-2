/***********************************************************************
 AUROSANAX ERP
 Archivo: catalogo_medicamentos.js
 Módulo: Catálogo Maestro de Medicamentos
 Versión: 1.4.0
 Fecha: 2026-09-04

 OBJETIVO ANTIRREGRESIVO
 - Conservar EXACTAMENTE los 15 medicamentos base actuales de plan.js.
 - Agregar nuevos medicamentos sin alterar el comportamiento previo.
 - Mantener compatibilidad con window.MEDICAMENTOS_AUROSANAX_BASE.
 - NO guardar datos.
 - NO modificar id_atencion.
 - NO tocar Plan, Recetas, Diagnósticos, Apps Script ni Google Sheets.
************************************************************************/

(function(){
    'use strict';

    const CATALOGO_AUROSANAX = [

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
           NUEVOS MEDICAMENTOS
           Sin esquemas universales automáticos.
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
            ind:'Antibacteriano sistémico; seleccionar dosis y esquema según diagnóstico, gravedad, edad y función renal/hepática.'
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
            cat:'GINECOLOGÍA',
            med:'Ácido tranexámico',
            principio_activo:'Ácido tranexámico',
            denominaciones_comerciales:[],
            nombres_alternativos:['Tranexamic acid'],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'HEMATOLOGÍA',
            med:'Sulfato ferroso',
            principio_activo:'Hierro',
            denominaciones_comerciales:[],
            nombres_alternativos:['Hierro','Ferrous sulfate'],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'OBSTETRICIA',
            med:'Ácido fólico',
            principio_activo:'Ácido fólico',
            denominaciones_comerciales:[],
            nombres_alternativos:['Folic acid'],
            forma_farmaceutica:'Sólido oral',
            concentracion:'1 mg y 5 mg',
            pres:'1 mg / 5 mg sólido oral',
            via:'VO',
            frec:'según riesgo obstétrico y protocolo clínico',
            dur:'según etapa preconcepcional/gestacional e indicación',
            ind:'Prevención y tratamiento de deficiencia de folato; en embarazo seleccionar dosis según riesgo obstétrico.'
        },

        {
            cat:'ENDOCRINOLOGÍA',
            med:'Metformina',
            principio_activo:'Metformina',
            denominaciones_comerciales:[],
            nombres_alternativos:['Metformin'],
            forma_farmaceutica:'Sólido oral',
            concentracion:'500 mg - 1.000 mg',
            pres:'500 mg - 1.000 mg sólido oral',
            via:'VO',
            frec:'según diagnóstico, tolerancia y formulación',
            dur:'tratamiento crónico según control clínico',
            ind:'Diabetes mellitus tipo 2 y otras indicaciones metabólicas según valoración clínica.'
        },

        {
            cat:'GINECOLOGÍA',
            med:'Espironolactona',
            principio_activo:'Espironolactona',
            denominaciones_comerciales:[],
            nombres_alternativos:['Spironolactone'],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'GINECOLOGÍA',
            med:'Medroxiprogesterona',
            principio_activo:'Medroxiprogesterona',
            denominaciones_comerciales:[],
            nombres_alternativos:['Acetato de medroxiprogesterona'],
            forma_farmaceutica:'Tableta / inyectable',
            concentracion:'según presentación registrada',
            pres:'tableta / inyectable',
            via:'Según presentación',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'GINECOLOGÍA',
            med:'Letrozol',
            principio_activo:'Letrozol',
            denominaciones_comerciales:[],
            nombres_alternativos:['Letrozole'],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'CARDIOVASCULAR',
            med:'Losartán',
            principio_activo:'Losartán',
            denominaciones_comerciales:[],
            nombres_alternativos:['Losartan'],
            forma_farmaceutica:'Sólido oral',
            concentracion:'50 mg y 100 mg',
            pres:'50 mg / 100 mg sólido oral',
            via:'VO',
            frec:'según diagnóstico y control tensional',
            dur:'tratamiento crónico según control clínico',
            ind:'Antagonista del receptor de angiotensina II; individualizar según presión arterial, función renal y potasio.'
        },

        {
            cat:'CARDIOVASCULAR',
            med:'Enalapril',
            principio_activo:'Enalapril',
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
            cat:'CARDIOVASCULAR',
            med:'Amlodipino',
            principio_activo:'Amlodipino',
            denominaciones_comerciales:[],
            nombres_alternativos:['Amlodipine'],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'CARDIOVASCULAR',
            med:'Hidroclorotiazida',
            principio_activo:'Hidroclorotiazida',
            denominaciones_comerciales:[],
            nombres_alternativos:['Hydrochlorothiazide'],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'CARDIOVASCULAR',
            med:'Clortalidona',
            principio_activo:'Clortalidona',
            denominaciones_comerciales:[],
            nombres_alternativos:['Chlorthalidone'],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'CARDIOVASCULAR',
            med:'Valsartán',
            principio_activo:'Valsartán',
            denominaciones_comerciales:[],
            nombres_alternativos:['Valsartan'],
            forma_farmaceutica:'Tableta',
            concentracion:'según presentación registrada',
            pres:'tableta',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        /* ============================================================
           INCORPORACIONES VALIDADAS / CONTROLADAS v1.1.0
           Sin pautas universales automáticas.
        ============================================================ */
        {
            cat:'GINECOLOGÍA', med:'Estriol', principio_activo:'Estriol',
            denominaciones_comerciales:[], nombres_alternativos:[],
            forma_farmaceutica:'Crema vaginal', concentracion:'0,1 %',
            pres:'0,1 % crema vaginal', via:'Vaginal', frec:'según diagnóstico/protocolo clínico', dur:'según diagnóstico y evolución', ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },
        {
            cat:'GINECOLOGÍA', med:'Dienogest', principio_activo:'Dienogest',
            denominaciones_comerciales:[], nombres_alternativos:[],
            forma_farmaceutica:'Tableta', concentracion:'2 mg',
            pres:'2 mg tableta', via:'VO', frec:'según diagnóstico/protocolo clínico', dur:'según diagnóstico y evolución', ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },
        {
            cat:'ENDOCRINOLOGÍA', med:'Calcifediol', principio_activo:'Calcifediol',
            denominaciones_comerciales:[], nombres_alternativos:[],
            forma_farmaceutica:'Cápsula', concentracion:'0,266 mg',
            pres:'0,266 mg cápsula', via:'VO', frec:'según diagnóstico/protocolo clínico', dur:'según diagnóstico y evolución', ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },
        {
            cat:'OTROS', med:'Melatonina', principio_activo:'Melatonina',
            denominaciones_comerciales:[], nombres_alternativos:[],
            forma_farmaceutica:'Tableta', concentracion:'5 mg',
            pres:'5 mg tableta', via:'VO', frec:'según diagnóstico/protocolo clínico', dur:'según diagnóstico y evolución', ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },
        {
            cat:'OTROS', med:'Ácido ascórbico', principio_activo:'Ácido ascórbico',
            denominaciones_comerciales:[], nombres_alternativos:['Vitamina C'],
            forma_farmaceutica:'', concentracion:'según presentación registrada',
            pres:'según presentación registrada', via:'Según presentación', frec:'según diagnóstico/protocolo clínico', dur:'según diagnóstico y evolución', ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },
        {
            cat:'OTROS', med:'Omega 3', principio_activo:'Omega 3',
            denominaciones_comerciales:[], nombres_alternativos:['Omega-3'],
            forma_farmaceutica:'Cápsula', concentracion:'1 g',
            pres:'1 g cápsula', via:'VO', frec:'según diagnóstico/protocolo clínico', dur:'según diagnóstico y evolución', ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir',
            clasificacion:'suplemento/complementario'
        }
,

        /* ============================================================
           AMPLIACIÓN OFICIAL-REFERENCIADA ECUADOR v1.3.0 — 50 ENTIDADES
           - Selección orientada a práctica clínica AUROSANAX.
           - Referencias nacionales: ARCSA + CNMB/CONASA.
           - Frecuencia, duración e indicaciones quedan VACÍAS.
           - Presentación/concentración/vía quedan VACÍAS cuando no se
             ha fijado una variante específica en el catálogo.
           - NO altera los 44 registros previos ni sus variantes.
        ============================================================ */

        {
    cat:'GINECOLOGÍA / OBSTETRICIA',
    med:'Progesterona',
    principio_activo:'Progesterona',
    denominaciones_comerciales:[],
    nombres_alternativos:['Progesterone'],
    forma_farmaceutica:'Sólido oral',
    concentracion:'100 mg',
    pres:'100 mg sólido oral',
    via:'VO/Vaginal',
    frec:'según indicación gineco-obstétrica',
    dur:'según indicación y seguimiento',
    ind:'Progestágeno; seleccionar vía y esquema según indicación ginecológica u obstétrica.'
},

        {
    cat:'GINECOLOGÍA / OBSTETRICIA',
    med:'Estradiol',
    principio_activo:'Estradiol',
    denominaciones_comerciales:[],
    nombres_alternativos:['Estradiol'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'GINECOLOGÍA / ANTICONCEPCIÓN',
    med:'Levonorgestrel',
    principio_activo:'Levonorgestrel',
    denominaciones_comerciales:[],
    nombres_alternativos:['Levonorgestrel'],
    forma_farmaceutica:'Sólido oral',
    concentracion:'0,75 mg y 1,5 mg',
    pres:'0,75 mg / 1,5 mg sólido oral',
    via:'VO',
    frec:'según indicación anticonceptiva',
    dur:'según esquema indicado',
    ind:'Anticoncepción de emergencia; seleccionar presentación y esquema conforme protocolo clínico.'
},

        {
    cat:'GINECOLOGÍA / ANTICONCEPCIÓN',
    med:'Etinilestradiol + levonorgestrel',
    principio_activo:'Etinilestradiol + levonorgestrel',
    denominaciones_comerciales:[],
    nombres_alternativos:['Ethinylestradiol + levonorgestrel'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'GINECOLOGÍA / ANTICONCEPCIÓN',
    med:'Desogestrel',
    principio_activo:'Desogestrel',
    denominaciones_comerciales:[],
    nombres_alternativos:['Desogestrel'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'GINECOLOGÍA / ANTICONCEPCIÓN',
    med:'Drospirenona + etinilestradiol',
    principio_activo:'Drospirenona + etinilestradiol',
    denominaciones_comerciales:[],
    nombres_alternativos:['Drospirenone + ethinylestradiol'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'GINECOLOGÍA / ANTICONCEPCIÓN',
    med:'Noretisterona',
    principio_activo:'Noretisterona',
    denominaciones_comerciales:[],
    nombres_alternativos:['Norethisterone', 'Noretindrona'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'GINECOLOGÍA / ENDOCRINOLOGÍA',
    med:'Cabergolina',
    principio_activo:'Cabergolina',
    denominaciones_comerciales:[],
    nombres_alternativos:['Cabergoline'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'GINECOLOGÍA / ENDOCRINOLOGÍA',
    med:'Bromocriptina',
    principio_activo:'Bromocriptina',
    denominaciones_comerciales:[],
    nombres_alternativos:['Bromocriptine'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'OBSTETRICIA',
    med:'Oxitocina',
    principio_activo:'Oxitocina',
    denominaciones_comerciales:[],
    nombres_alternativos:['Oxytocin'],
    forma_farmaceutica:'Líquido parenteral',
    concentracion:'10 UI/mL',
    pres:'10 UI/mL líquido parenteral',
    via:'Parenteral',
    frec:'según protocolo obstétrico',
    dur:'según respuesta clínica y protocolo',
    ind:'Uterotónico de uso obstétrico; administrar bajo protocolo y monitorización.'
},

        {
    cat:'GINECOLOGÍA / OBSTETRICIA',
    med:'Misoprostol',
    principio_activo:'Misoprostol',
    denominaciones_comerciales:[],
    nombres_alternativos:['Misoprostol'],
    forma_farmaceutica:'Sólido oral',
    concentracion:'200 mcg',
    pres:'200 mcg sólido oral',
    via:'VO/Vaginal',
    frec:'según indicación y protocolo obstétrico/ginecológico',
    dur:'según indicación y protocolo',
    ind:'Prostaglandina de uso protocolizado en ginecología/obstetricia; no usar pauta automática universal.'
},

        {
    cat:'OBSTETRICIA',
    med:'Dinoprostona',
    principio_activo:'Dinoprostona',
    denominaciones_comerciales:[],
    nombres_alternativos:['Dinoprostone'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'GINECOLOGÍA / FERTILIDAD',
    med:'Clomifeno',
    principio_activo:'Clomifeno',
    denominaciones_comerciales:[],
    nombres_alternativos:['Clomiphene', 'Citrato de clomifeno'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'GINECOLOGÍA / ONCOLOGÍA',
    med:'Tamoxifeno',
    principio_activo:'Tamoxifeno',
    denominaciones_comerciales:[],
    nombres_alternativos:['Tamoxifen'],
    forma_farmaceutica:'Sólido oral',
    concentracion:'10 mg - 20 mg',
    pres:'10 mg / 20 mg sólido oral',
    via:'VO',
    frec:'según protocolo oncológico',
    dur:'según protocolo oncológico y respuesta',
    ind:'Modulador selectivo del receptor de estrógeno; uso oncológico bajo protocolo especializado.'
},

        {
    cat:'ANTIINFECCIOSOS',
    med:'Amoxicilina',
    principio_activo:'Amoxicilina',
    denominaciones_comerciales:[],
    nombres_alternativos:['Amoxicillin'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ANTIINFECCIOSOS',
    med:'Ampicilina',
    principio_activo:'Ampicilina',
    denominaciones_comerciales:[],
    nombres_alternativos:['Ampicillin'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ANTIINFECCIOSOS',
    med:'Bencilpenicilina benzatínica',
    principio_activo:'Bencilpenicilina benzatínica',
    denominaciones_comerciales:[],
    nombres_alternativos:['Penicilina G benzatínica', 'Benzathine benzylpenicillin'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ANTIINFECCIOSOS',
    med:'Ciprofloxacino',
    principio_activo:'Ciprofloxacino',
    denominaciones_comerciales:[],
    nombres_alternativos:['Ciprofloxacin'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ANTIINFECCIOSOS',
    med:'Levofloxacino',
    principio_activo:'Levofloxacino',
    denominaciones_comerciales:[],
    nombres_alternativos:['Levofloxacin'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ANTIINFECCIOSOS',
    med:'Cefuroxima',
    principio_activo:'Cefuroxima',
    denominaciones_comerciales:[],
    nombres_alternativos:['Cefuroxime'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ANTIINFECCIOSOS',
    med:'Cefazolina',
    principio_activo:'Cefazolina',
    denominaciones_comerciales:[],
    nombres_alternativos:['Cefazolin'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ANTIINFECCIOSOS',
    med:'Cefixima',
    principio_activo:'Cefixima',
    denominaciones_comerciales:[],
    nombres_alternativos:['Cefixime'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ANTIINFECCIOSOS',
    med:'Gentamicina',
    principio_activo:'Gentamicina',
    denominaciones_comerciales:[],
    nombres_alternativos:['Gentamicin'],
    forma_farmaceutica:'Líquido parenteral',
    concentracion:'10 mg/mL - 140 mg/mL',
    pres:'10 mg/mL - 140 mg/mL líquido parenteral',
    via:'Parenteral',
    frec:'según peso, función renal e indicación',
    dur:'según infección, cultivo y evolución',
    ind:'Aminoglucósido; requiere ajuste por función renal y vigilancia de toxicidad según contexto clínico.'
},

        {
    cat:'ANTIINFECCIOSOS',
    med:'Amikacina',
    principio_activo:'Amikacina',
    denominaciones_comerciales:[],
    nombres_alternativos:['Amikacin'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ANTIINFECCIOSOS',
    med:'Trimetoprim + sulfametoxazol',
    principio_activo:'Trimetoprim + sulfametoxazol',
    denominaciones_comerciales:[],
    nombres_alternativos:['Cotrimoxazol', 'Trimethoprim + sulfamethoxazole'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ANTIVIRALES',
    med:'Aciclovir',
    principio_activo:'Aciclovir',
    denominaciones_comerciales:[],
    nombres_alternativos:['Acyclovir'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ANTIVIRALES',
    med:'Valaciclovir',
    principio_activo:'Valaciclovir',
    denominaciones_comerciales:[],
    nombres_alternativos:['Valacyclovir'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ANTIINFECCIOSOS',
    med:'Claritromicina',
    principio_activo:'Claritromicina',
    denominaciones_comerciales:[],
    nombres_alternativos:['Clarithromycin'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ANTIINFECCIOSOS',
    med:'Eritromicina',
    principio_activo:'Eritromicina',
    denominaciones_comerciales:[],
    nombres_alternativos:['Erythromycin'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'DOLOR / INFLAMACIÓN',
    med:'Diclofenaco',
    principio_activo:'Diclofenaco',
    denominaciones_comerciales:[],
    nombres_alternativos:['Diclofenac'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'DOLOR / INFLAMACIÓN',
    med:'Meloxicam',
    principio_activo:'Meloxicam',
    denominaciones_comerciales:[],
    nombres_alternativos:['Meloxicam'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'DOLOR / INFLAMACIÓN',
    med:'Celecoxib',
    principio_activo:'Celecoxib',
    denominaciones_comerciales:[],
    nombres_alternativos:['Celecoxib'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ANALGÉSICOS',
    med:'Tramadol',
    principio_activo:'Tramadol',
    denominaciones_comerciales:[],
    nombres_alternativos:['Tramadol'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ANALGÉSICOS',
    med:'Metamizol',
    principio_activo:'Metamizol',
    denominaciones_comerciales:[],
    nombres_alternativos:['Dipirona', 'Metamizole'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ANESTÉSICOS LOCALES',
    med:'Lidocaína',
    principio_activo:'Lidocaína',
    denominaciones_comerciales:[],
    nombres_alternativos:['Lignocaína', 'Lidocaine'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'GASTROENTEROLOGÍA',
    med:'Omeprazol',
    principio_activo:'Omeprazol',
    denominaciones_comerciales:[],
    nombres_alternativos:['Omeprazole'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'GASTROENTEROLOGÍA',
    med:'Pantoprazol',
    principio_activo:'Pantoprazol',
    denominaciones_comerciales:[],
    nombres_alternativos:['Pantoprazole'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'GASTROENTEROLOGÍA',
    med:'Famotidina',
    principio_activo:'Famotidina',
    denominaciones_comerciales:[],
    nombres_alternativos:['Famotidine'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ANTIEMÉTICOS',
    med:'Ondansetrón',
    principio_activo:'Ondansetrón',
    denominaciones_comerciales:[],
    nombres_alternativos:['Ondansetron'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ANTIEMÉTICOS',
    med:'Metoclopramida',
    principio_activo:'Metoclopramida',
    denominaciones_comerciales:[],
    nombres_alternativos:['Metoclopramide'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ALERGIA / INMUNOLOGÍA',
    med:'Loratadina',
    principio_activo:'Loratadina',
    denominaciones_comerciales:[],
    nombres_alternativos:['Loratadine'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ALERGIA / INMUNOLOGÍA',
    med:'Cetirizina',
    principio_activo:'Cetirizina',
    denominaciones_comerciales:[],
    nombres_alternativos:['Cetirizine'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'CORTICOIDES',
    med:'Prednisona',
    principio_activo:'Prednisona',
    denominaciones_comerciales:[],
    nombres_alternativos:['Prednisone'],
    forma_farmaceutica:'Sólido oral',
    concentracion:'5 mg y 20 mg',
    pres:'5 mg / 20 mg sólido oral',
    via:'VO',
    frec:'según diagnóstico y dosis total diaria',
    dur:'según diagnóstico; retirar gradualmente cuando corresponda',
    ind:'Corticoide sistémico; individualizar dosis y duración según enfermedad, respuesta y riesgo.'
},

        {
    cat:'CORTICOIDES',
    med:'Dexametasona',
    principio_activo:'Dexametasona',
    denominaciones_comerciales:[],
    nombres_alternativos:['Dexamethasone'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'CORTICOIDES',
    med:'Betametasona',
    principio_activo:'Betametasona',
    denominaciones_comerciales:[],
    nombres_alternativos:['Betamethasone'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'CARDIOVASCULAR',
    med:'Furosemida',
    principio_activo:'Furosemida',
    denominaciones_comerciales:[],
    nombres_alternativos:['Furosemide'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'CARDIOVASCULAR',
    med:'Propranolol',
    principio_activo:'Propranolol',
    denominaciones_comerciales:[],
    nombres_alternativos:['Propranolol'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'CARDIOVASCULAR / OBSTETRICIA',
    med:'Nifedipino',
    principio_activo:'Nifedipino',
    denominaciones_comerciales:[],
    nombres_alternativos:['Nifedipine'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'CARDIOVASCULAR / OBSTETRICIA',
    med:'Metildopa',
    principio_activo:'Metildopa',
    denominaciones_comerciales:[],
    nombres_alternativos:['Methyldopa'],
    forma_farmaceutica:'',
    concentracion:'según presentación registrada',
    pres:'según presentación registrada',
    via:'Según presentación',
    frec:'según diagnóstico/protocolo clínico',
    dur:'según diagnóstico y evolución',
    ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
},

        {
    cat:'ENDOCRINOLOGÍA',
    med:'Levotiroxina',
    principio_activo:'Levotiroxina',
    denominaciones_comerciales:[],
    nombres_alternativos:['Levothyroxine'],
    forma_farmaceutica:'Sólido oral',
    concentracion:'25 mcg - 200 mcg',
    pres:'25 mcg - 200 mcg sólido oral',
    via:'VO',
    frec:'según dosis individual y control tiroideo',
    dur:'tratamiento crónico según control clínico',
    ind:'Reposición de hormona tiroidea; individualizar dosis según TSH/T4, edad, embarazo y comorbilidades.'
},

        /* ============================================================
           EXPANSIÓN CLÍNICA ESTRUCTURAL v1.3.0 — 206 ENTRADAS NUEVAS
           Prioridad: Ginecología, Obstetricia, Medicina General y
           áreas frecuentes de consulta ambulatoria.
           Los campos de pauta no representan una prescripción universal.
           Deben verificarse contra diagnóstico, paciente, guías vigentes
           y registro/presentación aplicable en Ecuador.
        ============================================================ */

        {
            cat:'GINECOLOGÍA',
            med:'Terconazol',
            principio_activo:'Terconazol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Crema/óvulo vaginal',
            concentracion:'según presentación registrada',
            pres:'crema/óvulo vaginal',
            via:'Vaginal',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'GINECOLOGÍA',
            med:'Tioconazol',
            principio_activo:'Tioconazol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Óvulo/crema vaginal',
            concentracion:'según presentación registrada',
            pres:'óvulo/crema vaginal',
            via:'Vaginal',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'GINECOLOGÍA',
            med:'Butoconazol',
            principio_activo:'Butoconazol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Crema vaginal',
            concentracion:'según presentación registrada',
            pres:'crema vaginal',
            via:'Vaginal',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'GINECOLOGÍA',
            med:'Boric acid vaginal',
            principio_activo:'Boric acid vaginal',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula vaginal',
            concentracion:'según presentación registrada',
            pres:'cápsula vaginal',
            via:'Vaginal',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'GINECOLOGÍA',
            med:'Metronidazol vaginal',
            principio_activo:'Metronidazol vaginal',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Gel vaginal',
            concentracion:'según presentación registrada',
            pres:'gel vaginal',
            via:'Vaginal',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'GINECOLOGÍA',
            med:'Clindamicina oral',
            principio_activo:'Clindamicina oral',
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
            cat:'GINECOLOGÍA',
            med:'Estradiol vaginal',
            principio_activo:'Estradiol vaginal',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/crema vaginal',
            concentracion:'según presentación registrada',
            pres:'tableta/crema vaginal',
            via:'Vaginal',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'GINECOLOGÍA',
            med:'Estrógenos conjugados vaginales',
            principio_activo:'Estrógenos conjugados vaginales',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Crema vaginal',
            concentracion:'según presentación registrada',
            pres:'crema vaginal',
            via:'Vaginal',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'GINECOLOGÍA',
            med:'Progesterona micronizada',
            principio_activo:'Progesterona micronizada',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula',
            concentracion:'según presentación registrada',
            pres:'cápsula',
            via:'VO/Vaginal',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'GINECOLOGÍA',
            med:'Didrogesterona',
            principio_activo:'Didrogesterona',
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
            cat:'GINECOLOGÍA',
            med:'Etinilestradiol + desogestrel',
            principio_activo:'Etinilestradiol + desogestrel',
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
            cat:'GINECOLOGÍA',
            med:'Etinilestradiol + drospirenona',
            principio_activo:'Etinilestradiol + drospirenona',
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
            cat:'GINECOLOGÍA',
            med:'Drospirenona',
            principio_activo:'Drospirenona',
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
            cat:'GINECOLOGÍA',
            med:'Ulipristal acetato',
            principio_activo:'Ulipristal acetato',
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
            cat:'GINECOLOGÍA',
            med:'Levonorgestrel anticoncepción de emergencia',
            principio_activo:'Levonorgestrel anticoncepción de emergencia',
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
            cat:'GINECOLOGÍA',
            med:'Danazol',
            principio_activo:'Danazol',
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
            cat:'GINECOLOGÍA',
            med:'Raloxifeno',
            principio_activo:'Raloxifeno',
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
            cat:'GINECOLOGÍA',
            med:'Alendronato',
            principio_activo:'Alendronato',
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
            cat:'GINECOLOGÍA',
            med:'Ibandronato',
            principio_activo:'Ibandronato',
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
            cat:'GINECOLOGÍA',
            med:'Calcitriol',
            principio_activo:'Calcitriol',
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
            cat:'GINECOLOGÍA',
            med:'Carbonato de calcio',
            principio_activo:'Carbonato de calcio',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Sólido oral',
            concentracion:'500 mg',
            pres:'500 mg sólido oral',
            via:'VO',
            frec:'según indicación y aporte dietario',
            dur:'según riesgo y seguimiento',
            ind:'Suplementación de calcio; en obstetricia ajustar según riesgo, ingesta y protocolo clínico.'
        },

        {
            cat:'GINECOLOGÍA',
            med:'Calcio + vitamina D',
            principio_activo:'Calcio + vitamina D',
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
            cat:'GINECOLOGÍA',
            med:'Vitamina D3',
            principio_activo:'Vitamina D3',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula/gotas',
            concentracion:'según presentación registrada',
            pres:'cápsula/gotas',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'OBSTETRICIA',
            med:'Labetalol',
            principio_activo:'Labetalol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/inyectable',
            concentracion:'según presentación registrada',
            pres:'tableta/inyectable',
            via:'VO/IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'OBSTETRICIA',
            med:'Sulfato de magnesio',
            principio_activo:'Sulfato de magnesio',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Líquido parenteral',
            concentracion:'20 %',
            pres:'20 % líquido parenteral',
            via:'Parenteral',
            frec:'según protocolo obstétrico/hospitalario',
            dur:'según protocolo y monitorización',
            ind:'Uso hospitalario/obstétrico según indicación; requiere monitorización clínica.'
        },

        {
            cat:'OBSTETRICIA',
            med:'Carbetocina',
            principio_activo:'Carbetocina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'OBSTETRICIA',
            med:'Metilergonovina',
            principio_activo:'Metilergonovina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/inyectable',
            concentracion:'según presentación registrada',
            pres:'tableta/inyectable',
            via:'VO/IM/IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'OBSTETRICIA',
            med:'Hierro polimaltosado',
            principio_activo:'Hierro polimaltosado',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/jarabe',
            concentracion:'según presentación registrada',
            pres:'tableta/jarabe',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'OBSTETRICIA',
            med:'Hierro sacarosa',
            principio_activo:'Hierro sacarosa',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'OBSTETRICIA',
            med:'Carboximaltosa férrica',
            principio_activo:'Carboximaltosa férrica',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'OBSTETRICIA',
            med:'Yoduro de potasio',
            principio_activo:'Yoduro de potasio',
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
            cat:'OBSTETRICIA',
            med:'Multivitamínico prenatal',
            principio_activo:'Multivitamínico prenatal',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/cápsula',
            concentracion:'según presentación registrada',
            pres:'tableta/cápsula',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'OBSTETRICIA',
            med:'Doxilamina + piridoxina',
            principio_activo:'Doxilamina + piridoxina',
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
            cat:'ANTIINFECCIOSOS',
            med:'Penicilina G benzatínica',
            principio_activo:'Penicilina G benzatínica',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'IM',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Penicilina G cristalina',
            principio_activo:'Penicilina G cristalina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Penicilina V',
            principio_activo:'Penicilina V',
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
            cat:'ANTIINFECCIOSOS',
            med:'Dicloxacilina',
            principio_activo:'Dicloxacilina',
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
            cat:'ANTIINFECCIOSOS',
            med:'Oxacilina',
            principio_activo:'Oxacilina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Cefotaxima',
            principio_activo:'Cefotaxima',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'IV/IM',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Ceftazidima',
            principio_activo:'Ceftazidima',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Cefepima',
            principio_activo:'Cefepima',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Piperacilina + tazobactam',
            principio_activo:'Piperacilina + tazobactam',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Meropenem',
            principio_activo:'Meropenem',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Imipenem + cilastatina',
            principio_activo:'Imipenem + cilastatina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Ertapenem',
            principio_activo:'Ertapenem',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'IV/IM',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Moxifloxacino',
            principio_activo:'Moxifloxacino',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/inyectable',
            concentracion:'según presentación registrada',
            pres:'tableta/inyectable',
            via:'VO/IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Linezolid',
            principio_activo:'Linezolid',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/inyectable',
            concentracion:'según presentación registrada',
            pres:'tableta/inyectable',
            via:'VO/IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Vancomicina',
            principio_activo:'Vancomicina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Tobramicina',
            principio_activo:'Tobramicina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable/oftálmico',
            concentracion:'según presentación registrada',
            pres:'inyectable/oftálmico',
            via:'IV/IM/Oftálmica',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Rifampicina',
            principio_activo:'Rifampicina',
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
            cat:'ANTIINFECCIOSOS',
            med:'Isoniazida',
            principio_activo:'Isoniazida',
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
            cat:'ANTIINFECCIOSOS',
            med:'Pirazinamida',
            principio_activo:'Pirazinamida',
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
            cat:'ANTIINFECCIOSOS',
            med:'Etambutol',
            principio_activo:'Etambutol',
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
            cat:'ANTIINFECCIOSOS',
            med:'Oseltamivir',
            principio_activo:'Oseltamivir',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula/suspensión',
            concentracion:'según presentación registrada',
            pres:'cápsula/suspensión',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Ganciclovir',
            principio_activo:'Ganciclovir',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Albendazol',
            principio_activo:'Albendazol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/suspensión',
            concentracion:'según presentación registrada',
            pres:'tableta/suspensión',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Mebendazol',
            principio_activo:'Mebendazol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/suspensión',
            concentracion:'según presentación registrada',
            pres:'tableta/suspensión',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Ivermectina',
            principio_activo:'Ivermectina',
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
            cat:'ANTIINFECCIOSOS',
            med:'Praziquantel',
            principio_activo:'Praziquantel',
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
            cat:'ANTIINFECCIOSOS',
            med:'Nitazoxanida',
            principio_activo:'Nitazoxanida',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/suspensión',
            concentracion:'según presentación registrada',
            pres:'tableta/suspensión',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ANTIINFECCIOSOS',
            med:'Nistatina oral',
            principio_activo:'Nistatina oral',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Suspensión',
            concentracion:'según presentación registrada',
            pres:'suspensión',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'DOLOR / INFLAMACIÓN',
            med:'Diclofenaco sódico',
            principio_activo:'Diclofenaco sódico',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/inyectable',
            concentracion:'según presentación registrada',
            pres:'tableta/inyectable',
            via:'VO/IM',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'DOLOR / INFLAMACIÓN',
            med:'Etoricoxib',
            principio_activo:'Etoricoxib',
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
            med:'Dexketoprofeno',
            principio_activo:'Dexketoprofeno',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/inyectable',
            concentracion:'según presentación registrada',
            pres:'tableta/inyectable',
            via:'VO/IM/IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'DOLOR / INFLAMACIÓN',
            med:'Codeína',
            principio_activo:'Codeína',
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
            med:'Paracetamol + codeína',
            principio_activo:'Paracetamol + codeína',
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
            cat:'DOLOR / INFLAMACIÓN',
            med:'Ciclobenzaprina',
            principio_activo:'Ciclobenzaprina',
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
            med:'Tizanidina',
            principio_activo:'Tizanidina',
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
            cat:'GASTROENTEROLOGÍA',
            med:'Esomeprazol',
            principio_activo:'Esomeprazol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula/tableta',
            concentracion:'según presentación registrada',
            pres:'cápsula/tableta',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'GASTROENTEROLOGÍA',
            med:'Lansoprazol',
            principio_activo:'Lansoprazol',
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
            cat:'GASTROENTEROLOGÍA',
            med:'Sucralfato',
            principio_activo:'Sucralfato',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/suspensión',
            concentracion:'según presentación registrada',
            pres:'tableta/suspensión',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'GASTROENTEROLOGÍA',
            med:'Domperidona',
            principio_activo:'Domperidona',
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
            cat:'GASTROENTEROLOGÍA',
            med:'Dimenhidrinato',
            principio_activo:'Dimenhidrinato',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/inyectable',
            concentracion:'según presentación registrada',
            pres:'tableta/inyectable',
            via:'VO/IM/IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'GASTROENTEROLOGÍA',
            med:'Loperamida',
            principio_activo:'Loperamida',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Sólido oral',
            concentracion:'2 mg',
            pres:'2 mg sólido oral',
            via:'VO',
            frec:'según cuadro clínico y límites de dosis',
            dur:'uso corto según evolución',
            ind:'Antidiarreico sintomático; evitar cuando exista sospecha de diarrea invasiva u otra contraindicación.'
        },

        {
            cat:'GASTROENTEROLOGÍA',
            med:'Racecadotrilo',
            principio_activo:'Racecadotrilo',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula/sobre',
            concentracion:'según presentación registrada',
            pres:'cápsula/sobre',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'GASTROENTEROLOGÍA',
            med:'Lactulosa',
            principio_activo:'Lactulosa',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Jarabe',
            concentracion:'según presentación registrada',
            pres:'jarabe',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'GASTROENTEROLOGÍA',
            med:'Polietilenglicol',
            principio_activo:'Polietilenglicol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Polvo oral',
            concentracion:'según presentación registrada',
            pres:'polvo oral',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'GASTROENTEROLOGÍA',
            med:'Bisacodilo',
            principio_activo:'Bisacodilo',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/supositorio',
            concentracion:'según presentación registrada',
            pres:'tableta/supositorio',
            via:'VO/Rectal',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'GASTROENTEROLOGÍA',
            med:'Senósidos',
            principio_activo:'Senósidos',
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
            cat:'GASTROENTEROLOGÍA',
            med:'Simeticona',
            principio_activo:'Simeticona',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/gotas',
            concentracion:'según presentación registrada',
            pres:'tableta/gotas',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'GASTROENTEROLOGÍA',
            med:'Hidróxido de aluminio + magnesio',
            principio_activo:'Hidróxido de aluminio + magnesio',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Suspensión/tableta',
            concentracion:'según presentación registrada',
            pres:'suspensión/tableta',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'RESPIRATORIO / ALERGIA',
            med:'Salbutamol',
            principio_activo:'Salbutamol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inhalador/nebulización',
            concentracion:'según presentación registrada',
            pres:'inhalador/nebulización',
            via:'Inhalatoria',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'RESPIRATORIO / ALERGIA',
            med:'Ipratropio',
            principio_activo:'Ipratropio',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inhalador/nebulización',
            concentracion:'según presentación registrada',
            pres:'inhalador/nebulización',
            via:'Inhalatoria',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'RESPIRATORIO / ALERGIA',
            med:'Budesonida inhalada',
            principio_activo:'Budesonida inhalada',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inhalador/nebulización',
            concentracion:'según presentación registrada',
            pres:'inhalador/nebulización',
            via:'Inhalatoria',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'RESPIRATORIO / ALERGIA',
            med:'Beclometasona inhalada',
            principio_activo:'Beclometasona inhalada',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inhalador',
            concentracion:'según presentación registrada',
            pres:'inhalador',
            via:'Inhalatoria',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'RESPIRATORIO / ALERGIA',
            med:'Fluticasona inhalada',
            principio_activo:'Fluticasona inhalada',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inhalador',
            concentracion:'según presentación registrada',
            pres:'inhalador',
            via:'Inhalatoria',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'RESPIRATORIO / ALERGIA',
            med:'Formoterol',
            principio_activo:'Formoterol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inhalador',
            concentracion:'según presentación registrada',
            pres:'inhalador',
            via:'Inhalatoria',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'RESPIRATORIO / ALERGIA',
            med:'Salmeterol',
            principio_activo:'Salmeterol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inhalador',
            concentracion:'según presentación registrada',
            pres:'inhalador',
            via:'Inhalatoria',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'RESPIRATORIO / ALERGIA',
            med:'Budesonida + formoterol',
            principio_activo:'Budesonida + formoterol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inhalador',
            concentracion:'según presentación registrada',
            pres:'inhalador',
            via:'Inhalatoria',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'RESPIRATORIO / ALERGIA',
            med:'Fluticasona + salmeterol',
            principio_activo:'Fluticasona + salmeterol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inhalador',
            concentracion:'según presentación registrada',
            pres:'inhalador',
            via:'Inhalatoria',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'RESPIRATORIO / ALERGIA',
            med:'Montelukast',
            principio_activo:'Montelukast',
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
            cat:'RESPIRATORIO / ALERGIA',
            med:'Desloratadina',
            principio_activo:'Desloratadina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/jarabe',
            concentracion:'según presentación registrada',
            pres:'tableta/jarabe',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'RESPIRATORIO / ALERGIA',
            med:'Levocetirizina',
            principio_activo:'Levocetirizina',
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
            cat:'RESPIRATORIO / ALERGIA',
            med:'Fexofenadina',
            principio_activo:'Fexofenadina',
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
            cat:'RESPIRATORIO / ALERGIA',
            med:'Clorfenamina',
            principio_activo:'Clorfenamina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/jarabe',
            concentracion:'según presentación registrada',
            pres:'tableta/jarabe',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'RESPIRATORIO / ALERGIA',
            med:'Oxymetazolina nasal',
            principio_activo:'Oxymetazolina nasal',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Spray nasal',
            concentracion:'según presentación registrada',
            pres:'spray nasal',
            via:'Nasal',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'RESPIRATORIO / ALERGIA',
            med:'Fluticasona nasal',
            principio_activo:'Fluticasona nasal',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Spray nasal',
            concentracion:'según presentación registrada',
            pres:'spray nasal',
            via:'Nasal',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'RESPIRATORIO / ALERGIA',
            med:'Mometasona nasal',
            principio_activo:'Mometasona nasal',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Spray nasal',
            concentracion:'según presentación registrada',
            pres:'spray nasal',
            via:'Nasal',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'CARDIOVASCULAR',
            med:'Losartán + hidroclorotiazida',
            principio_activo:'Losartán + hidroclorotiazida',
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
            cat:'CARDIOVASCULAR',
            med:'Valsartán + amlodipino',
            principio_activo:'Valsartán + amlodipino',
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
            cat:'CARDIOVASCULAR',
            med:'Telmisartán',
            principio_activo:'Telmisartán',
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
            cat:'CARDIOVASCULAR',
            med:'Candesartán',
            principio_activo:'Candesartán',
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
            cat:'CARDIOVASCULAR',
            med:'Ramipril',
            principio_activo:'Ramipril',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/cápsula',
            concentracion:'según presentación registrada',
            pres:'tableta/cápsula',
            via:'VO',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'CARDIOVASCULAR',
            med:'Lisinopril',
            principio_activo:'Lisinopril',
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
            cat:'CARDIOVASCULAR',
            med:'Carvedilol',
            principio_activo:'Carvedilol',
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
            cat:'CARDIOVASCULAR',
            med:'Metoprolol',
            principio_activo:'Metoprolol',
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
            cat:'CARDIOVASCULAR',
            med:'Bisoprolol',
            principio_activo:'Bisoprolol',
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
            cat:'CARDIOVASCULAR',
            med:'Atenolol',
            principio_activo:'Atenolol',
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
            cat:'CARDIOVASCULAR',
            med:'Hidralazina',
            principio_activo:'Hidralazina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/inyectable',
            concentracion:'según presentación registrada',
            pres:'tableta/inyectable',
            via:'VO/IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'CARDIOVASCULAR',
            med:'Isosorbida mononitrato',
            principio_activo:'Isosorbida mononitrato',
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
            cat:'CARDIOVASCULAR',
            med:'Nitroglicerina',
            principio_activo:'Nitroglicerina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/spray',
            concentracion:'según presentación registrada',
            pres:'tableta/spray',
            via:'Sublingual',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'CARDIOVASCULAR',
            med:'Atorvastatina',
            principio_activo:'Atorvastatina',
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
            cat:'CARDIOVASCULAR',
            med:'Rosuvastatina',
            principio_activo:'Rosuvastatina',
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
            cat:'CARDIOVASCULAR',
            med:'Simvastatina',
            principio_activo:'Simvastatina',
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
            cat:'CARDIOVASCULAR',
            med:'Ezetimiba',
            principio_activo:'Ezetimiba',
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
            cat:'CARDIOVASCULAR',
            med:'Clopidogrel',
            principio_activo:'Clopidogrel',
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
            cat:'CARDIOVASCULAR',
            med:'Ácido acetilsalicílico',
            principio_activo:'Ácido acetilsalicílico',
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
            cat:'ENDOCRINOLOGÍA',
            med:'Glibenclamida',
            principio_activo:'Glibenclamida',
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
            cat:'ENDOCRINOLOGÍA',
            med:'Gliclazida',
            principio_activo:'Gliclazida',
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
            cat:'ENDOCRINOLOGÍA',
            med:'Glimepirida',
            principio_activo:'Glimepirida',
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
            cat:'ENDOCRINOLOGÍA',
            med:'Sitagliptina',
            principio_activo:'Sitagliptina',
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
            cat:'ENDOCRINOLOGÍA',
            med:'Linagliptina',
            principio_activo:'Linagliptina',
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
            cat:'ENDOCRINOLOGÍA',
            med:'Empagliflozina',
            principio_activo:'Empagliflozina',
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
            cat:'ENDOCRINOLOGÍA',
            med:'Dapagliflozina',
            principio_activo:'Dapagliflozina',
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
            cat:'ENDOCRINOLOGÍA',
            med:'Pioglitazona',
            principio_activo:'Pioglitazona',
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
            cat:'ENDOCRINOLOGÍA',
            med:'Insulina NPH',
            principio_activo:'Insulina NPH',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'SC',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ENDOCRINOLOGÍA',
            med:'Insulina regular',
            principio_activo:'Insulina regular',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'SC/IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ENDOCRINOLOGÍA',
            med:'Insulina glargina',
            principio_activo:'Insulina glargina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'SC',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ENDOCRINOLOGÍA',
            med:'Insulina lispro',
            principio_activo:'Insulina lispro',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'SC',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ENDOCRINOLOGÍA',
            med:'Insulina aspart',
            principio_activo:'Insulina aspart',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'SC',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ENDOCRINOLOGÍA',
            med:'Propiltiouracilo',
            principio_activo:'Propiltiouracilo',
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
            cat:'ENDOCRINOLOGÍA',
            med:'Metimazol',
            principio_activo:'Metimazol',
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
            cat:'DERMATOLOGÍA',
            med:'Ketoconazol tópico',
            principio_activo:'Ketoconazol tópico',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Crema/champú',
            concentracion:'según presentación registrada',
            pres:'crema/champú',
            via:'Tópica',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'DERMATOLOGÍA',
            med:'Terbinafina',
            principio_activo:'Terbinafina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/crema',
            concentracion:'según presentación registrada',
            pres:'tableta/crema',
            via:'VO/Tópica',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'DERMATOLOGÍA',
            med:'Ciclopirox',
            principio_activo:'Ciclopirox',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Crema/laca',
            concentracion:'según presentación registrada',
            pres:'crema/laca',
            via:'Tópica',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'DERMATOLOGÍA',
            med:'Betametasona tópica',
            principio_activo:'Betametasona tópica',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Crema/ungüento',
            concentracion:'según presentación registrada',
            pres:'crema/ungüento',
            via:'Tópica',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'DERMATOLOGÍA',
            med:'Mometasona tópica',
            principio_activo:'Mometasona tópica',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Crema',
            concentracion:'según presentación registrada',
            pres:'crema',
            via:'Tópica',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'DERMATOLOGÍA',
            med:'Clobetasol',
            principio_activo:'Clobetasol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Crema/ungüento',
            concentracion:'según presentación registrada',
            pres:'crema/ungüento',
            via:'Tópica',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'DERMATOLOGÍA',
            med:'Tretinoína tópica',
            principio_activo:'Tretinoína tópica',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Crema/gel',
            concentracion:'según presentación registrada',
            pres:'crema/gel',
            via:'Tópica',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'DERMATOLOGÍA',
            med:'Adapaleno',
            principio_activo:'Adapaleno',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Gel/crema',
            concentracion:'según presentación registrada',
            pres:'gel/crema',
            via:'Tópica',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'DERMATOLOGÍA',
            med:'Peróxido de benzoilo',
            principio_activo:'Peróxido de benzoilo',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Gel',
            concentracion:'según presentación registrada',
            pres:'gel',
            via:'Tópica',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'DERMATOLOGÍA',
            med:'Ácido azelaico',
            principio_activo:'Ácido azelaico',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Crema/gel',
            concentracion:'según presentación registrada',
            pres:'crema/gel',
            via:'Tópica',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'DERMATOLOGÍA',
            med:'Calamina',
            principio_activo:'Calamina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Loción',
            concentracion:'según presentación registrada',
            pres:'loción',
            via:'Tópica',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'DERMATOLOGÍA',
            med:'Urea tópica',
            principio_activo:'Urea tópica',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Crema',
            concentracion:'según presentación registrada',
            pres:'crema',
            via:'Tópica',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'UROLOGÍA',
            med:'Tamsulosina',
            principio_activo:'Tamsulosina',
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
            cat:'UROLOGÍA',
            med:'Finasterida',
            principio_activo:'Finasterida',
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
            cat:'UROLOGÍA',
            med:'Dutasterida',
            principio_activo:'Dutasterida',
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
            cat:'UROLOGÍA',
            med:'Oxibutinina',
            principio_activo:'Oxibutinina',
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
            cat:'UROLOGÍA',
            med:'Solifenacina',
            principio_activo:'Solifenacina',
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
            cat:'UROLOGÍA',
            med:'Mirabegrón',
            principio_activo:'Mirabegrón',
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
            cat:'UROLOGÍA',
            med:'Sildenafilo',
            principio_activo:'Sildenafilo',
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
            cat:'UROLOGÍA',
            med:'Tadalafilo',
            principio_activo:'Tadalafilo',
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
            cat:'NEUROLOGÍA / PSIQUIATRÍA',
            med:'Sertralina',
            principio_activo:'Sertralina',
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
            cat:'NEUROLOGÍA / PSIQUIATRÍA',
            med:'Fluoxetina',
            principio_activo:'Fluoxetina',
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
            cat:'NEUROLOGÍA / PSIQUIATRÍA',
            med:'Escitalopram',
            principio_activo:'Escitalopram',
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
            cat:'NEUROLOGÍA / PSIQUIATRÍA',
            med:'Paroxetina',
            principio_activo:'Paroxetina',
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
            cat:'NEUROLOGÍA / PSIQUIATRÍA',
            med:'Venlafaxina',
            principio_activo:'Venlafaxina',
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
            cat:'NEUROLOGÍA / PSIQUIATRÍA',
            med:'Bupropión',
            principio_activo:'Bupropión',
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
            cat:'NEUROLOGÍA / PSIQUIATRÍA',
            med:'Clonazepam',
            principio_activo:'Clonazepam',
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
            cat:'NEUROLOGÍA / PSIQUIATRÍA',
            med:'Diazepam',
            principio_activo:'Diazepam',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/inyectable',
            concentracion:'según presentación registrada',
            pres:'tableta/inyectable',
            via:'VO/IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'NEUROLOGÍA / PSIQUIATRÍA',
            med:'Lorazepam',
            principio_activo:'Lorazepam',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/inyectable',
            concentracion:'según presentación registrada',
            pres:'tableta/inyectable',
            via:'VO/IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'NEUROLOGÍA / PSIQUIATRÍA',
            med:'Quetiapina',
            principio_activo:'Quetiapina',
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
            cat:'OFTALMOLOGÍA',
            med:'Lágrimas artificiales',
            principio_activo:'Lágrimas artificiales',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Gotas',
            concentracion:'según presentación registrada',
            pres:'gotas',
            via:'Oftálmica',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'OFTALMOLOGÍA',
            med:'Tobramicina oftálmica',
            principio_activo:'Tobramicina oftálmica',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Gotas',
            concentracion:'según presentación registrada',
            pres:'gotas',
            via:'Oftálmica',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'OFTALMOLOGÍA',
            med:'Ciprofloxacino oftálmico',
            principio_activo:'Ciprofloxacino oftálmico',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Gotas',
            concentracion:'según presentación registrada',
            pres:'gotas',
            via:'Oftálmica',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'OFTALMOLOGÍA',
            med:'Olopatadina',
            principio_activo:'Olopatadina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Gotas',
            concentracion:'según presentación registrada',
            pres:'gotas',
            via:'Oftálmica',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Omega 3 EPA/DHA',
            principio_activo:'Omega 3 EPA/DHA',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula/aceite',
            concentracion:'según presentación registrada',
            pres:'cápsula/aceite',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Magnesio citrato',
            principio_activo:'Magnesio citrato',
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
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Vitamina B12',
            principio_activo:'Vitamina B12',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/inyectable',
            concentracion:'según presentación registrada',
            pres:'tableta/inyectable',
            via:'VO/IM',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Complejo B',
            principio_activo:'Complejo B',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/inyectable',
            concentracion:'según presentación registrada',
            pres:'tableta/inyectable',
            via:'VO/IM',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Coenzima Q10',
            principio_activo:'Coenzima Q10',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula',
            concentracion:'según presentación registrada',
            pres:'cápsula',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'N-acetilcisteína',
            principio_activo:'N-acetilcisteína',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula/sobre',
            concentracion:'según presentación registrada',
            pres:'cápsula/sobre',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Ácido alfa lipoico',
            principio_activo:'Ácido alfa lipoico',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula/tableta',
            concentracion:'según presentación registrada',
            pres:'cápsula/tableta',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Inositol',
            principio_activo:'Inositol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Polvo/cápsula',
            concentracion:'según presentación registrada',
            pres:'polvo/cápsula',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Mio-inositol + D-quiro-inositol',
            principio_activo:'Mio-inositol + D-quiro-inositol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Polvo/cápsula',
            concentracion:'según presentación registrada',
            pres:'polvo/cápsula',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'L-carnitina',
            principio_activo:'L-carnitina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Solución/cápsula',
            concentracion:'según presentación registrada',
            pres:'solución/cápsula',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Glutatión',
            principio_activo:'Glutatión',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula/solución',
            concentracion:'según presentación registrada',
            pres:'cápsula/solución',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Curcumina',
            principio_activo:'Curcumina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula',
            concentracion:'según presentación registrada',
            pres:'cápsula',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Resveratrol',
            principio_activo:'Resveratrol',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula',
            concentracion:'según presentación registrada',
            pres:'cápsula',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Quercetina',
            principio_activo:'Quercetina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula',
            concentracion:'según presentación registrada',
            pres:'cápsula',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Vitamina K2',
            principio_activo:'Vitamina K2',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula',
            concentracion:'según presentación registrada',
            pres:'cápsula',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Vitamina D3 + K2',
            principio_activo:'Vitamina D3 + K2',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula/gotas',
            concentracion:'según presentación registrada',
            pres:'cápsula/gotas',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Colágeno hidrolizado',
            principio_activo:'Colágeno hidrolizado',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Polvo',
            concentracion:'según presentación registrada',
            pres:'polvo',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Creatina monohidratada',
            principio_activo:'Creatina monohidratada',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Polvo',
            concentracion:'según presentación registrada',
            pres:'polvo',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Probiótico multicepa',
            principio_activo:'Probiótico multicepa',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Cápsula/sobre',
            concentracion:'según presentación registrada',
            pres:'cápsula/sobre',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'ORTOMOLECULAR / NUTRICIÓN',
            med:'Prebióticos',
            principio_activo:'Prebióticos',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Polvo/cápsula',
            concentracion:'según presentación registrada',
            pres:'polvo/cápsula',
            via:'VO',
            frec:'según objetivo clínico y formulación',
            dur:'según objetivo clínico y seguimiento',
            ind:'Verificar composición, registro aplicable, contraindicaciones e interacciones'
        },

        {
            cat:'HEMATOLOGÍA',
            med:'Ácido fólico + hierro',
            principio_activo:'Ácido fólico + hierro',
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
            cat:'HEMATOLOGÍA',
            med:'Cianocobalamina',
            principio_activo:'Cianocobalamina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Tableta/inyectable',
            concentracion:'según presentación registrada',
            pres:'tableta/inyectable',
            via:'VO/IM',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'HEMATOLOGÍA',
            med:'Hidroxocobalamina',
            principio_activo:'Hidroxocobalamina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Inyectable',
            concentracion:'según presentación registrada',
            pres:'inyectable',
            via:'IM/IV',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        },

        {
            cat:'HEMATOLOGÍA',
            med:'Warfarina',
            principio_activo:'Warfarina',
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
            cat:'HEMATOLOGÍA',
            med:'Rivaroxabán',
            principio_activo:'Rivaroxabán',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Sólido oral',
            concentracion:'2,5 mg - 20 mg',
            pres:'2,5 mg - 20 mg sólido oral',
            via:'VO',
            frec:'según indicación y dosis seleccionada',
            dur:'según indicación tromboembólica',
            ind:'Anticoagulante oral; seleccionar dosis según indicación, función renal, interacciones y riesgo hemorrágico.'
        },

        {
            cat:'HEMATOLOGÍA',
            med:'Apixabán',
            principio_activo:'Apixabán',
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
            cat:'HEMATOLOGÍA',
            med:'Enoxaparina',
            principio_activo:'Enoxaparina',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Líquido parenteral',
            concentracion:'20 mg - 100 mg',
            pres:'20 mg - 100 mg líquido parenteral',
            via:'SC',
            frec:'según indicación, peso y función renal',
            dur:'según indicación tromboembólica y protocolo',
            ind:'Anticoagulante; ajustar dosis por indicación, peso, función renal y riesgo hemorrágico.'
        },

        {
            cat:'MEDICINA GENERAL',
            med:'Allopurinol',
            principio_activo:'Allopurinol',
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
            cat:'MEDICINA GENERAL',
            med:'Colchicina',
            principio_activo:'Colchicina',
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
            cat:'MEDICINA GENERAL',
            med:'Alopurinol + colchicina',
            principio_activo:'Alopurinol + colchicina',
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
            cat:'MEDICINA GENERAL',
            med:'Acetilcisteína mucolítico',
            principio_activo:'Acetilcisteína mucolítico',
            denominaciones_comerciales:[],
            nombres_alternativos:[],
            forma_farmaceutica:'Sobre/solución',
            concentracion:'según presentación registrada',
            pres:'sobre/solución',
            via:'VO/Inhalatoria',
            frec:'según diagnóstico/protocolo clínico',
            dur:'según diagnóstico y evolución',
            ind:'Verificar dosis, contraindicaciones e interacciones antes de prescribir'
        }
    ];

    function texto(valor){
        return String(valor === null || valor === undefined ? '' : valor).trim();
    }

    function normalizar(valor){
        return texto(valor)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g,'')
            .toLowerCase()
            .replace(/\s+/g,' ')
            .trim();
    }

    function arrayTexto(valor){
        if(Array.isArray(valor)){
            return valor.map(texto).filter(Boolean);
        }

        if(!texto(valor)) return [];

        return [texto(valor)];
    }

    /* ============================================================
       CAPA MULTIVARIANTE v1.1.0
       - ADITIVA: no cambia los campos históricos med/pres/via.
       - vias_compatibles son sugerencias clínicas, no bloqueos.
       - Plan podrá ofrecer "Otra vía" usando su lista general.
    ============================================================ */

    const VARIANTES_AUROSANAX = {
        'clotrimazol': [
            { forma_farmaceutica:'Óvulo vaginal', concentracion:'', pres:'óvulo vaginal', vias_compatibles:['Vaginal'] },
            { forma_farmaceutica:'Óvulo vaginal', concentracion:'500 mg', pres:'500 mg óvulo vaginal', vias_compatibles:['Vaginal'] }
        ],
        'clindamicina': [
            { forma_farmaceutica:'Crema vaginal', concentracion:'', pres:'crema vaginal', vias_compatibles:['Vaginal'] },
            { forma_farmaceutica:'Tableta / cápsula', concentracion:'300 mg', pres:'300 mg tableta / cápsula', vias_compatibles:['VO'] }
        ],
        'acido folico': [
            { forma_farmaceutica:'Sólido oral', concentracion:'1 mg', pres:'1 mg sólido oral', vias_compatibles:['VO'], estado:'CNMB_EC_11R_2023' },
            { forma_farmaceutica:'Sólido oral', concentracion:'5 mg', pres:'5 mg sólido oral', vias_compatibles:['VO'], estado:'CNMB_EC_11R_2023' }
        ],
        'medroxiprogesterona': [
            { forma_farmaceutica:'Tableta / inyectable', concentracion:'', pres:'tableta / inyectable', vias_compatibles:[] },
            { forma_farmaceutica:'Inyectable', concentracion:'150 mg/1 mL', pres:'150 mg/1 mL inyectable', vias_compatibles:['IM'] }
        ],
        'estriol': [
            { forma_farmaceutica:'Crema vaginal', concentracion:'0,1 %', pres:'0,1 % crema vaginal', vias_compatibles:['Vaginal'] }
        ],
        'dienogest': [
            { forma_farmaceutica:'Tableta', concentracion:'2 mg', pres:'2 mg tableta', vias_compatibles:['VO'] }
        ],
        'calcifediol': [
            { forma_farmaceutica:'Cápsula', concentracion:'0,266 mg', pres:'0,266 mg cápsula', vias_compatibles:['VO'] }
        ],
        'melatonina': [
            { forma_farmaceutica:'Tableta', concentracion:'5 mg', pres:'5 mg tableta', vias_compatibles:['VO'] }
        ],
        'acido ascorbico': [],
        'ceftriaxona': [
            { forma_farmaceutica:'Sólido parenteral', concentracion:'500 mg', pres:'500 mg sólido parenteral', vias_compatibles:['Parenteral'], estado:'CNMB_EC_11R_2023' },
            { forma_farmaceutica:'Sólido parenteral', concentracion:'1.000 mg', pres:'1.000 mg sólido parenteral', vias_compatibles:['Parenteral'], estado:'CNMB_EC_11R_2023' }
        ],
        'tamoxifeno': [
            { forma_farmaceutica:'Sólido oral', concentracion:'10 mg', pres:'10 mg sólido oral', vias_compatibles:['VO'], estado:'CNMB_EC_11R_2023' },
            { forma_farmaceutica:'Sólido oral', concentracion:'20 mg', pres:'20 mg sólido oral', vias_compatibles:['VO'], estado:'CNMB_EC_11R_2023' }
        ],
        'losartan': [
            { forma_farmaceutica:'Sólido oral', concentracion:'50 mg', pres:'50 mg sólido oral', vias_compatibles:['VO'], estado:'CNMB_EC_11R_2023' },
            { forma_farmaceutica:'Sólido oral', concentracion:'100 mg', pres:'100 mg sólido oral', vias_compatibles:['VO'], estado:'CNMB_EC_11R_2023' }
        ],
        'levonorgestrel': [
            { forma_farmaceutica:'Sólido oral', concentracion:'0,75 mg', pres:'0,75 mg sólido oral', vias_compatibles:['VO'], estado:'CNMB_EC_11R_2023' },
            { forma_farmaceutica:'Sólido oral', concentracion:'1,5 mg', pres:'1,5 mg sólido oral', vias_compatibles:['VO'], estado:'CNMB_EC_11R_2023' }
        ],
        'prednisona': [
            { forma_farmaceutica:'Sólido oral', concentracion:'5 mg', pres:'5 mg sólido oral', vias_compatibles:['VO'], estado:'CNMB_EC_11R_2023' },
            { forma_farmaceutica:'Sólido oral', concentracion:'20 mg', pres:'20 mg sólido oral', vias_compatibles:['VO'], estado:'CNMB_EC_11R_2023' }
        ],
        'progesterona': [
            { forma_farmaceutica:'Sólido oral', concentracion:'100 mg', pres:'100 mg sólido oral', vias_compatibles:['VO','Vaginal'], estado:'CNMB_EC_11R_2023' }
        ],
        'omega 3': [
            { forma_farmaceutica:'Cápsula', concentracion:'1 g', pres:'1 g cápsula', vias_compatibles:['VO'], estado:'uso_habitual_aurosanax' }
        ]
    };

    const METADATOS_NUEVOS_AUROSANAX = {
        'estriol': {cat:'GINECOLOGÍA', principio_activo:'Estriol', nombres_alternativos:[]},
        'dienogest': {cat:'GINECOLOGÍA', principio_activo:'Dienogest', nombres_alternativos:[]},
        'calcifediol': {cat:'ENDOCRINOLOGÍA', principio_activo:'Calcifediol', nombres_alternativos:[]},
        'melatonina': {cat:'OTROS', principio_activo:'Melatonina', nombres_alternativos:[]},
        'acido ascorbico': {cat:'OTROS', principio_activo:'Ácido ascórbico', nombres_alternativos:['Vitamina C']},
        'omega 3': {cat:'OTROS', principio_activo:'Omega 3', nombres_alternativos:['Omega-3'], clasificacion:'suplemento/complementario'}
    };

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
        const variantesPropias = Array.isArray(m.variantes) ? m.variantes : VARIANTES_AUROSANAX[clave];

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
        });

        return Array.from(mapa.values());
    }

    const existentes =
        Array.isArray(window.MEDICAMENTOS_AUROSANAX_BASE)
            ? window.MEDICAMENTOS_AUROSANAX_BASE
            : [];

    window.MEDICAMENTOS_AUROSANAX_BASE =
        fusionarSinDuplicados([
            ...CATALOGO_AUROSANAX,
            ...existentes
        ]);

    window.AUROSANAX_CATALOGO_MEDICAMENTOS = {

        version:'1.4.0',

        obtenerTodos:function(){
            return window.MEDICAMENTOS_AUROSANAX_BASE.slice();
        },

        cantidad:function(){
            return window.MEDICAMENTOS_AUROSANAX_BASE.length;
        },

        obtenerVariantes:function(medicamento){
            const q = normalizar(medicamento);
            const item = window.MEDICAMENTOS_AUROSANAX_BASE.find(function(m){
                return normalizar(m.med) === q || normalizar(m.principio_activo) === q;
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
                return window.MEDICAMENTOS_AUROSANAX_BASE.slice();
            }

            return window.MEDICAMENTOS_AUROSANAX_BASE.filter(function(m){

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


    /* IASYN 2 - aliases locales de compatibilidad. El catalogo es una copia local; no existe dependencia remota. */
    window.MEDICAMENTOS_IASYN_BASE = window.MEDICAMENTOS_AUROSANAX_BASE;
    window.IASYN_CATALOGO_MEDICAMENTOS = window.AUROSANAX_CATALOGO_MEDICAMENTOS;

})();
