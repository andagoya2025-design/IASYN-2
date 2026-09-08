/* =====================================================
   IASYN ERP - MÓDULO RECETAS
   Archivo: recetas.js
   Versión: 2.2 diagnóstico CIE-10 persistente por atención
   Función: vista previa profesional + PDF + historial local filtrado por paciente + paginación + acciones verticales + refresco estable
            + edición independiente de recetas + vínculo con atenciones.
            + guardado JSON + impresión premium compacta + cabecera clínica Sexo/Alergias + edición responsive + hora local Ecuador + edición limpia sin duplicidades.
   Importante:
   - No modifica Plan automáticamente desde Recetas.
   - Mantiene sincronización Plan → Receta.
   - No modifica pacientes, agenda, dashboard, antecedentes ni examen físico.
===================================================== */

/* =====================================================
   IASYN - NOTA DE COMPATIBILIDAD DE AISLAMIENTO
   -----------------------------------------------------
   Este módulo no contiene URLs directas de Apps Script, Drive, Sheets
   ni aurosanax.com. Las claves/eventos `aurosanax_*` / `aurosanax:*`,
   `window.auroDiagnosticos`, `window.AUROSANAX_SEGURIDAD` y nombres
   públicos `auro*` que permanecen son contratos internos heredados entre
   módulos del ERP. Se conservan temporalmente para no romper Atenciones,
   Diagnóstico, Plan, Seguridad e impresión; deben migrarse de forma
   coordinada, no archivo por archivo.
===================================================== */

(function(){
  'use strict';

  const STORAGE_KEY = 'aurosanax_recetas_emitidas_v1';
  let recetaEditandoId = null;
  let recetasPaginaActual = 1;
  const RECETAS_POR_PAGINA = 5;
  let recetasHistorialVisible = true;
  let recetaAccionesAbiertaId = '';
  let recetaGuardando = false;
  let recetaEstadoVisual = '';
  let recetaEstadoTimer = null;
  let recetaBloqueoPostGuardadoHasta = 0;
  let recetaAtencionActualId = '';
  let recetaNuevaForzada = false;
  let recetaPlanAtencionId = '';
  let recetasSheetsCargadas = false;
  let recetasSheetsCargando = false;
  const recetaDiagnosticosPorAtencionCache = new Map();
  let recetaMedicosActivos = [];
  let recetaMedicosCargados = false;
  let recetaMedicosCargando = null;

  /*
    IASYN RECETAS 2.5 - VISTA PACIENTE OFICIAL ÚNICA
    ---------------------------------------------------
    Referencia funcional oficial:
    "Vista paciente / imprimir" del historial de recetas emitidas.
    Esta referencia se reutiliza para:
    - botón superior PDF / imprimir;
    - acceso piloto desde Documentos/Recomendaciones/Certificados;
    - historial de recetas emitidas.
    No modifica guardado, Plan, backend ni base de datos.
  */
  let recetaVentanaPaciente = null;
  let recetaPreviewVisible = false;
  let recetaModoTrabajo = 'lectura';

  /*
    IASYN RECETAS 3.0 - EDITOR ESTRUCTURADO ESPEJO
    recMedicamento continúa siendo el campo canónico consumido
    por guardarRecetaERP(). El editor solo sincroniza ese mismo dato.
  */
  let recetaEditorMedicamentos = [];
  let recetaEditorTratamientoSucio = false;
  let recetaEditorTratamientoMontado = false;

  function el(id){ return document.getElementById(id); }
  function val(id){ return (el(id)?.value || '').trim(); }
  function setVal(id, value){ if(el(id)) el(id).value = value || ''; }

  function safe(text){
    return String(text || '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }

  function nl2br(text){ return safe(text).replace(/\n/g,'<br>'); }

  function fechaHoyReceta(){
    if(typeof fechaHoyISO === 'function') return fechaHoyISO();
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  function fechaHoraVisual(){
    const d = new Date();
    return d.toLocaleString('es-EC', {
      timeZone:'America/Guayaquil',
      year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'
    });
  }

  function fechaHoraEcuadorISO(){
    const d = new Date();
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone:'America/Guayaquil',
      year:'numeric',
      month:'2-digit',
      day:'2-digit',
      hour:'2-digit',
      minute:'2-digit',
      second:'2-digit',
      hour12:false
    }).formatToParts(d).reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
    return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}-05:00`;
  }

  function normalizarMedicamentoRecetaObjeto(m){
    m = m || {};
    return {
      med: m.med || m.medicamento || m.nombre || '',
      pres: m.pres || m.presentacion || '',
      via: m.via || '',
      cantidad: m.cantidad || '',
      frec: m.frec || m.frecuencia || '',
      dur: m.dur || m.duracion || '',
      ind: m.ind || m.indicaciones || '',
      continuo: m.continuo || 'No'
    };
  }

  function medicamentoRecetaEsJSON(valor){
    const txt = String(valor || '').trim();
    if(!txt) return false;
    if(!(txt.startsWith('[') || txt.startsWith('{'))) return false;
    try{
      JSON.parse(txt);
      return true;
    }catch(e){
      return false;
    }
  }

  function recetaListaTextoDesdeValor(valor){
    const txt = String(valor || '').trim();
    if(!txt) return [];

    if(txt.startsWith('[') || txt.startsWith('{')){
      try{
        let data = JSON.parse(txt);
        if(!Array.isArray(data)) data = [data];

        return data
          .map(item => {
            if(typeof item === 'string') return item;
            if(item && typeof item === 'object'){
              return item.texto || item.descripcion || item.indicacion || item.recomendacion || '';
            }
            return '';
          })
          .map(x => String(x || '').trim())
          .filter(Boolean);
      }catch(e){}
    }

    return txt
      .split(/\r?\n+/)
      .map(x => String(x || '').replace(/^[•\-]\s*/, '').trim())
      .filter(Boolean);
  }

  function recetaClaveLinea(valor){
    return String(valor || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function recetaDeduplicarLineas(valor){
    const vistas = new Set();
    const salida = [];

    recetaListaTextoDesdeValor(valor).forEach(linea => {
      const limpia = String(linea || '').trim();
      const clave = recetaClaveLinea(limpia);
      if(!limpia || !clave || vistas.has(clave)) return;
      vistas.add(clave);
      salida.push(limpia);
    });

    return salida;
  }

  function recetaListaParaGuardarJSON(valor){
    const lista = recetaDeduplicarLineas(valor);
    return lista.length ? JSON.stringify(lista) : '';
  }

  function recetaListaParaFormulario(valor){
    return recetaDeduplicarLineas(valor).join('\n');
  }

  function medicamentoRecetaJSONATexto(valor){
    const txt = String(valor || '').trim();
    if(!txt) return '';

    if(!medicamentoRecetaEsJSON(txt)){
      return txt;
    }

    try{
      let data = JSON.parse(txt);
      if(!Array.isArray(data)) data = [data];

      return data.map((item, i) => {
        if(typeof item === 'string'){
          return `${i + 1}. ${item}`;
        }

        if(item && item.texto){
          const limpio = String(item.texto || '').trim();
          return /^\d+\./.test(limpio) ? limpio : `${i + 1}. ${limpio}`;
        }

        const m = normalizarMedicamentoRecetaObjeto(item || {});
        const linea = [
          `${i + 1}. ${m.med || ''}`,
          m.pres || '',
          m.via || '',
          m.cantidad ? `Cantidad: ${m.cantidad}` : '',
          m.frec || '',
          m.dur ? `por ${m.dur}` : '',
          m.ind || ''
        ].filter(Boolean).join(' - ');

        return m.continuo === 'Sí'
          ? linea + ' - Tratamiento continuo'
          : linea;
      }).filter(Boolean).join('\n');

    }catch(e){
      return txt;
    }
  }


  /* =====================================================
     RECETA PREMIUM COMPACTA
     - No cambia guardado JSON.
     - Solo convierte datos para vista previa/PDF y mejora UI de edición.
  ===================================================== */

  function recetaMedicamentosALista(valor){
    const txt = String(valor || '').trim();
    if(!txt) return [];

    if(medicamentoRecetaEsJSON(txt)){
      try{
        let data = JSON.parse(txt);
        if(!Array.isArray(data)) data = [data];
        return data.map(item => {
          if(typeof item === 'string') return { texto: item };
          if(item && item.texto) return { texto: String(item.texto || '').trim() };
          return normalizarMedicamentoRecetaObjeto(item || {});
        }).filter(x => (x.texto || x.med || '').trim());
      }catch(e){
        return [];
      }
    }

    return txt.split(/\n+/)
      .map(x => x.replace(/^\s*\d+\.\s*/, '').trim())
      .filter(Boolean)
      .map(x => ({ texto: x }));
  }

  function recetaNormalizarPlano(txt){
    return String(txt || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function recetaTituloMedicamentoPremium(m){
    if(m.texto) return safe(m.texto.replace(/^\s*\d+\.\s*/, '').trim());

    const med = String(m.med || '').trim();
    const pres = String(m.pres || '').trim();
    if(!pres) return safe(med);

    const nMed = recetaNormalizarPlano(med);
    const nPres = recetaNormalizarPlano(pres);

    // Evita duplicados como "Clotrimazol óvulo vaginal óvulo vaginal".
    if(nMed && nPres && nMed.includes(nPres)) return safe(med);

    return safe([med, pres].filter(Boolean).join(' '));
  }


  function recetaTituloMedicamentoPlano(m){
    if(m.texto) return String(m.texto || '').replace(/^\s*\d+\.\s*/, '').trim();

    const med = String(m.med || '').trim();
    const pres = String(m.pres || '').trim();
    if(!pres) return med;

    const nMed = recetaNormalizarPlano(med);
    const nPres = recetaNormalizarPlano(pres);

    // Evita duplicados como "Clotrimazol óvulo vaginal óvulo vaginal".
    if(nMed && nPres && nMed.includes(nPres)) return med;

    return [med, pres].filter(Boolean).join(' ');
  }

  function recetaMedicamentoTextoAObjeto(linea){
    const original = String(linea || '').replace(/^\s*\d+\.\s*/, '').trim();
    if(!original) return null;

    const partes = original.split(' - ').map(x => x.trim()).filter(Boolean);

    if(partes.length < 3){
      return { texto: original };
    }

    return {
      med: partes[0] || '',
      pres: partes[1] || '',
      via: partes[2] || '',
      cantidad: /^Cantidad:/i.test(partes[3] || '') ? (partes[3] || '').replace(/^Cantidad:\s*/i, '') : '',
      frec: /^Cantidad:/i.test(partes[3] || '') ? (partes[4] || '') : (partes[3] || ''),
      dur: (partes.find(x => /^por\s+/i.test(x)) || '').replace(/^por\s+/i, ''),
      ind: partes.filter(x => !/^Cantidad:/i.test(x) && !/^por\s+/i.test(x)).slice(/^Cantidad:/i.test(partes[3] || '') ? 5 : 4).join(' - '),
      continuo: /tratamiento\s+continuo/i.test(original) ? 'Sí' : 'No'
    };
  }

  function recetaMedicamentosListaEdicion(valor){
    const medsPlan = recetaMedicamentosPlanActualesSeguros();

    if(medsPlan.length){
      return medsPlan;
    }

    return recetaMedicamentosALista(valor).map(item => {
      if(item && item.texto){
        return recetaMedicamentoTextoAObjeto(item.texto) || item;
      }
      return normalizarMedicamentoRecetaObjeto(item || {});
    }).filter(x => (x.texto || x.med || '').trim());
  }

  function recetaMedicamentosEdicionTexto(valor){
    const lista = recetaMedicamentosListaEdicion(valor);
    if(!lista.length) return String(valor || '').trim();

    return lista.map((item, i) => {
      if(item.texto){
        return `${i + 1}. ${String(item.texto || '').replace(/^\s*\d+\.\s*/, '').trim()}`;
      }

      const m = normalizarMedicamentoRecetaObjeto(item);
      const lineas = [];
      lineas.push(`${i + 1}. ${recetaTituloMedicamentoPlano(m)}`.trim());

      const detalle = [
        m.via ? `Vía: ${m.via}` : '',
        m.cantidad ? `Cantidad: ${m.cantidad}` : '',
        m.frec ? `Frecuencia: ${m.frec}` : '',
        m.dur ? `Duración: ${m.dur}` : '',
        m.continuo === 'Sí' ? 'Tratamiento continuo' : ''
      ].filter(Boolean).join(' · ');

      if(detalle) lineas.push(`   ${detalle}`);
      if(m.ind) lineas.push(`   Indicaciones: ${m.ind}`);

      return lineas.join('\n');
    }).join('\n\n');
  }

  function auroRecetaNormalizarMedicamentosEdicionSiSeguro(){
    const campo = el('recMedicamento');
    if(!campo) return;

    if(recetaEditorTratamientoMontado){
      if(recetaEditorTratamientoSucio){
        auroRecetaEditorSincronizarCampoCanonico();
      }else{
        auroRecetaEditorRenderDesdeCampo(true);
      }
      return;
    }

    const actual = campo.value || '';
    const nuevo = recetaMedicamentosEdicionTexto(actual);

    if(nuevo && nuevo !== actual){
      campo.value = nuevo;
    }
  }

  function auroRecetaCodigoNormalizado(codigo){
    return String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function auroRecetaDiagnosticoGenerico(txt){
    const n = recetaNormalizarPlano(txt);

    if(!n) return true;

    const exactos = new Set([
      'diagnostico principal',
      'diagnostico',
      'motivo de receta',
      'sin diagnostico',
      'diagnostico clinico',
      'diagnostico clinico relacionado',
      'diagnostico relacionado'
    ]);

    if(exactos.has(n)) return true;

    return (
      n.startsWith('diagnostico clinico relacionado') ||
      n.startsWith('diagnostico clinico') ||
      n === 'clinico'
    );
  }

  function auroRecetaBuscarDiagnosticoActivoPorCIE(cie){
    const cieNorm = auroRecetaCodigoNormalizado(cie);
    if(!cieNorm) return '';

    const posiblesBodies = [
      document.getElementById('hcDxSeleccionadosBody'),
      document.getElementById('hcDiagnosticosSeleccionadosBody'),
      document.getElementById('hcDiagnosticosPreviosBody')
    ].filter(Boolean);

    for(const body of posiblesBodies){
      const filas = Array.from(body.querySelectorAll('tr'));
      for(const tr of filas){
        const txtFila = String(tr.innerText || '').replace(/\s+/g, ' ').trim();
        if(!txtFila) continue;
        if(!txtFila.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(cieNorm)) continue;

        const celdas = Array.from(tr.querySelectorAll('td')).map(td => String(td.innerText || '').trim()).filter(Boolean);
        const nombre = celdas.find(c => {
          const cn = auroRecetaCodigoNormalizado(c);
          return cn !== cieNorm && !/^principal|presuntivo|definitivo|accion|agregar$/i.test(c);
        });

        if(nombre && !auroRecetaDiagnosticoGenerico(nombre)){
          return `${cie} - ${nombre.replace(/^\s*[-–]\s*/, '')}`;
        }

        return txtFila;
      }
    }

    return '';
  }

  function auroRecetaBuscarDiagnosticoPersistido(cie){
    const cieNorm = auroRecetaCodigoNormalizado(cie);
    const idAtencion = obtenerIdAtencionActivaSeguro();
    const paciente = obtenerPacienteActivoSeguro();
    const idPaciente = String(paciente?.id_paciente || paciente?.id || '').trim();

    const fuentes = [
      window.hcDiagnosticosSeleccionados,
      window.diagnosticos,
      window.diagnosticosClinicos,
      window.examenFisicoState?.diagnosticos
    ].filter(Array.isArray);

    for(const lista of fuentes){
      const encontrados = lista.filter(dx => {
        const codigo = auroRecetaCodigoNormalizado(
          dx.codigo_cie10 || dx.diagnostico_cie10 || dx.cie10 || dx.codigo || ''
        );
        const coincideAtencion = !idAtencion || !dx.id_atencion ||
          String(dx.id_atencion) === String(idAtencion);
        const coincidePaciente = !idPaciente || !dx.id_paciente ||
          String(dx.id_paciente) === String(idPaciente);
        return codigo === cieNorm && coincideAtencion && coincidePaciente;
      });

      const principal = encontrados.find(dx =>
        String(dx.principal || '').toUpperCase() === 'SI'
      ) || encontrados[0];

      const descripcion = String(
        principal?.descripcion ||
        principal?.diagnostico ||
        principal?.nombre ||
        ''
      ).trim();

      if(descripcion && !auroRecetaDiagnosticoGenerico(descripcion)){
        return cie ? `${cie} - ${descripcion}` : descripcion;
      }
    }

    return '';
  }

  function auroRecetaObtenerDiagnosticoAutomatico(){
    const cie = val('recCie10') || val('hcCie10Principal');
    const dxDOM = auroRecetaBuscarDiagnosticoActivoPorCIE(cie);
    if(dxDOM && !auroRecetaDiagnosticoGenerico(dxDOM)) return dxDOM;

    const dxPersistido = auroRecetaBuscarDiagnosticoPersistido(cie);
    if(dxPersistido && !auroRecetaDiagnosticoGenerico(dxPersistido)){
      return dxPersistido;
    }

    const dx = val('hcDiagnosticoPrincipal') || val('hcDiagnosticoResumen') || val('hcDiagnosticoTexto') || '';
    if(dx && !auroRecetaDiagnosticoGenerico(dx)){
      const cieNorm = auroRecetaCodigoNormalizado(cie);
      const dxNorm = auroRecetaCodigoNormalizado(dx);
      return cie && !dxNorm.includes(cieNorm) ? `${cie} - ${dx}` : dx;
    }

    /*
      No fabricar una descripción clínica.
      Si todavía no existe una descripción real, se devuelve vacío para que
      el flujo asíncrono la consulte por id_atencion en diagnósticos.
    */
    return '';
  }

  function auroRecetaAutocompletarDiagnosticoSiVacio(){
    if(!val('recCie10') && val('hcCie10Principal')){
      setVal('recCie10', val('hcCie10Principal'));
    }

    const actual = val('recDiagnostico');
    if(actual && !auroRecetaDiagnosticoGenerico(actual)) return;

    const dx = auroRecetaObtenerDiagnosticoAutomatico();
    if(dx) setVal('recDiagnostico', dx);
  }

  function recetaMedicamentosPremiumHTML(valor){
    const lista = recetaMedicamentosALista(valor);
    if(!lista.length){
      const texto = medicamentoRecetaJSONATexto(valor);
      return texto ? nl2br(texto) : 'Sin medicamentos registrados.';
    }

    return '<div class="auro-rx-list">' + lista.map((item, i) => {
      if(item.texto){
        return '<div class="auro-rx-item compacto">' +
          '<div class="auro-rx-title"><span class="auro-rx-num">' + (i + 1) + '</span><b>' + safe(item.texto.replace(/^\s*\d+\.\s*/, '')) + '</b></div>' +
        '</div>';
      }

      const m = normalizarMedicamentoRecetaObjeto(item);
      const detalle = [
        m.via ? '<span><b>Vía:</b> ' + safe(m.via) + '</span>' : '',
        m.frec ? '<span><b>Frecuencia:</b> ' + safe(m.frec) + '</span>' : '',
        m.dur ? '<span><b>Duración:</b> ' + safe(m.dur) + '</span>' : '',
        m.cantidad ? '<span><b>Cantidad:</b> ' + safe(m.cantidad) + '</span>' : ''
      ].filter(Boolean).join('');

      return '<div class="auro-rx-item">' +
        '<div class="auro-rx-title"><span class="auro-rx-num">' + (i + 1) + '</span><b>' + recetaTituloMedicamentoPremium(m) + '</b>' + (m.continuo === 'Sí' ? '<em>Continuo</em>' : '') + '</div>' +
        (detalle ? '<div class="auro-rx-meta">' + detalle + '</div>' : '') +
        (m.ind ? '<div class="auro-rx-ind"><b>Indicaciones:</b> ' + safe(m.ind) + '</div>' : '') +
      '</div>';
    }).join('') + '</div>';
  }

  function recetaBloqueTextoPremium(texto, vacio){
    const partes = recetaDeduplicarLineas(texto);
    if(!partes.length){
      return '<div class="auro-empty-note">' + safe(vacio || '—') + '</div>';
    }
    if(partes.length === 1){
      return '<div class="auro-text-premium">' + safe(partes[0]) + '</div>';
    }
    return '<div class="auro-text-premium"><ul>' +
      partes.map(x => '<li>' + safe(x) + '</li>').join('') +
      '</ul></div>';
  }

  function instalarEstilosEdicionRecetaPremium(){
    if(document.getElementById('auro-receta-edicion-premium-style')) return;
    const style = document.createElement('style');
    style.id = 'auro-receta-edicion-premium-style';
    style.textContent = `
      #recetas .cardx{border-radius:20px!important;box-shadow:0 14px 36px rgba(15,23,42,.07)!important;}
      #recetas label,.receta-label{font-weight:850!important;color:#374151!important;letter-spacing:.01em;}
      #recMedicamento,#recIndicaciones,#recRecomendaciones{
        border:1px solid #ead5e2!important;
        border-radius:16px!important;
        background:linear-gradient(135deg,#ffffff,#fff8fc)!important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 6px 18px rgba(139,30,90,.045)!important;
        color:#111827!important;
        font-size:13.5px!important;
        line-height:1.45!important;
        padding:12px 14px!important;
        resize:vertical!important;
      }
      #recMedicamento{min-height:150px!important;font-family:Arial,system-ui,sans-serif!important;}
      #recIndicaciones{min-height:92px!important;}
      #recRecomendaciones{min-height:82px!important;background:linear-gradient(135deg,#ffffff,#f8fafc)!important;}
      #recMedicamento:focus,#recIndicaciones:focus,#recRecomendaciones:focus{
        border-color:#c23b83!important;
        box-shadow:0 0 0 3px rgba(194,59,131,.12),0 8px 22px rgba(139,30,90,.08)!important;
        outline:none!important;
      }
      #recetas .form-control,#recetas .form-select{
        border-radius:14px!important;
      }
      #recetas label[for="recMedicamento"],#recetas label[for="recIndicaciones"],#recetas label[for="recRecomendaciones"]{display:flex;align-items:center;gap:7px;margin-bottom:7px!important;color:#5a1740!important;}
      #recetas label[for="recMedicamento"]:before,#recetas label[for="recIndicaciones"]:before,#recetas label[for="recRecomendaciones"]:before{content:"";width:7px;height:7px;border-radius:50%;background:#c23b83;box-shadow:0 0 0 4px #fdf2f8;flex:0 0 auto;}
      #recetaPreview{border-radius:22px!important;}

      /* IASYN RECETAS 2.6 - cabecera clínica y contexto visual */
      #recetas .auro-receta-context-card{
        grid-template-columns:1fr!important;
        padding:0!important;
        overflow:hidden!important;
        border:1px solid #ead5e2!important;
        background:linear-gradient(135deg,#ffffff 0%,#fffafd 100%)!important;
        box-shadow:0 10px 28px rgba(139,30,90,.06)!important;
      }
      #recetas .auro-receta-context-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:15px 16px 12px;border-bottom:1px solid #f3e7ee;}
      #recetas .auro-receta-context-kicker{font-size:10.5px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#9d174d;margin-bottom:3px;}
      #recetas .auro-receta-context-name{font-size:18px;font-weight:900;color:#111827;line-height:1.2;}
      #recetas .auro-receta-context-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end;}
      #recetas .auro-receta-context-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;padding:0 16px 14px;}
      #recetas .auro-receta-context-item{padding:10px 12px 7px 0;min-width:0;}
      #recetas .auro-receta-context-item small{display:block;color:#64748b;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px;}
      #recetas .auro-receta-context-item b{display:block;color:#111827;font-size:12.5px;line-height:1.25;overflow-wrap:anywhere;}
      #recetas .auro-receta-modebar{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #dbeafe;background:linear-gradient(135deg,#eff6ff,#ffffff);border-radius:15px;padding:9px 12px;margin:-4px 0 14px;color:#1e3a8a;font-size:12.5px;font-weight:750;}
      #recetas .auro-receta-modebar .badge-auro{white-space:nowrap;}
      #recetas .auro-receta-form-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px;padding:0 1px;}
      #recetas .auro-receta-form-title b{font-size:14px;color:#111827;font-weight:900;}
      #recetas .auro-receta-form-title small{color:#64748b;font-size:11.5px;}
      #recetasHistorialBox .auro-receta-filter-label{display:block;color:#64748b;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.035em;margin:0 0 4px 2px;}
      #recetasHistorialBox .auro-receta-dx-cell b{display:block;color:#111827;font-size:12px;line-height:1.25;}
      #recetasHistorialBox .auro-receta-dx-cell small{display:block;color:#64748b;margin-top:2px;}
      #recetasHistorialBox .auro-receta-medico-cell{min-width:190px;line-height:1.22;}
      #recetasHistorialBox .auro-receta-medico-cell b{
        display:block;
        color:#111827;
        font-size:12.5px;
        font-weight:900;
        margin-bottom:3px;
        white-space:normal;
        overflow-wrap:anywhere;
      }
      #recetasHistorialBox .auro-receta-medico-cell small{
        display:block;
        color:#64748b;
        font-size:12px;
        font-weight:650;
        line-height:1.25;
        white-space:normal;
        overflow-wrap:anywhere;
      }

      /* IASYN RECETAS 2.6B - PULIDO VISUAL PREMIUM COMPLETO */
      #recetas > .cardx > .section-head{
        align-items:flex-end!important;
        gap:18px!important;
        padding-bottom:14px!important;
        border-bottom:1px solid #f1e7ed!important;
        margin-bottom:15px!important;
      }
      #recetas > .cardx > .section-head h4{
        margin:0!important;
        color:#111827!important;
        font-size:22px!important;
        line-height:1.12!important;
        font-weight:950!important;
        letter-spacing:-.015em!important;
      }
      #recetas > .cardx > .section-head p{
        margin:4px 0 0!important;
        color:#64748b!important;
        font-size:13px!important;
        line-height:1.35!important;
        max-width:680px!important;
      }
      #recetas .auro-receta-main-actions{
        display:grid!important;
        grid-template-columns:repeat(3,max-content)!important;
        gap:9px!important;
        align-items:stretch!important;
        justify-content:end!important;
        flex-wrap:nowrap!important;
      }
      #recetas .auro-receta-main-actions button{
        min-height:43px!important;
        padding:9px 13px!important;
        border-radius:13px!important;
        font-size:12.5px!important;
        line-height:1.15!important;
        font-weight:850!important;
        white-space:nowrap!important;
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        gap:0!important;
        box-shadow:0 5px 14px rgba(15,23,42,.045)!important;
      }
      #recetas .auro-receta-main-actions button i.bi,
      #recetas .auro-receta-context-actions button i.bi{
        margin-right:6px!important;
        flex:0 0 auto!important;
      }
      #recetas #btnVistaPreviaReceta[aria-pressed="true"]{
        background:#fdf2f8!important;
        color:#8b1e5a!important;
        border-color:#e9a9ca!important;
        box-shadow:0 0 0 3px rgba(194,59,131,.08)!important;
      }
      #recetas #btnPdfRecetaOficial{
        border-color:#d7c3d1!important;
        background:#fff!important;
      }
      #recetas .auro-receta-context-kicker{
        letter-spacing:.09em!important;
      }
      #recetas .auro-receta-context-name{
        font-size:20px!important;
        line-height:1.18!important;
      }
      #recetas .auro-receta-consulta-item{
        text-align:center!important;
        border:1px solid #dbeafe!important;
        background:linear-gradient(135deg,#eff6ff,#ffffff)!important;
        border-radius:14px!important;
        margin:5px 8px 5px 0!important;
        padding:9px 10px!important;
        align-self:stretch!important;
      }
      #recetas .auro-receta-consulta-item small{
        color:#1d4ed8!important;
        margin-bottom:3px!important;
      }
      #recetas .auro-receta-consulta-item b{
        color:#1e3a8a!important;
        font-size:17px!important;
        font-weight:950!important;
        letter-spacing:.01em!important;
      }
      #recetas .auro-receta-profesional-item{
        border-left:3px solid #ead5e2!important;
        padding-left:12px!important;
      }
      #recetas .auro-receta-profesional-item .auro-receta-especialidad{
        display:block!important;
        color:#111827!important;
        font-size:13px!important;
        font-weight:950!important;
        line-height:1.22!important;
        margin-bottom:3px!important;
      }
      #recetas .auro-receta-profesional-item .auro-receta-medico{
        display:block!important;
        color:#64748b!important;
        font-size:12.5px!important;
        font-weight:650!important;
        line-height:1.25!important;
        overflow-wrap:anywhere!important;
      }
      #recetas #recetaPreview{
        border:1px solid #ead5e2!important;
        box-shadow:0 12px 30px rgba(15,23,42,.07)!important;
        margin-top:14px!important;
      }
      #recetas #recetaPreview.auro-receta-preview-hidden{
        display:none!important;
      }
      #recetasHistorialBox th.auro-receta-consulta-th,
      #recetasHistorialBox td.auro-receta-consulta-td{
        text-align:center!important;
        vertical-align:middle!important;
      }
      #recetasHistorialBox .auro-receta-consulta-badge{
        min-width:58px!important;
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        padding:7px 10px!important;
        border-radius:12px!important;
        background:#eff6ff!important;
        border:1px solid #bfdbfe!important;
        color:#1e40af!important;
        font-size:13px!important;
        font-weight:950!important;
        line-height:1!important;
        white-space:nowrap!important;
      }
      #recetasHistorialBox .table-modern th{
        vertical-align:middle!important;
      }
      #recetasHistorialBox .table-modern td{
        padding-top:12px!important;
        padding-bottom:12px!important;
      }

      /* IASYN RECETAS 3.0 - Editor tabulado espejo del PDF oficial */
      #recetas .auro-rx-editor-shell{
        margin-top:4px;
        border:1px solid #f0d9e6;
        border-radius:16px;
        background:#fff;
        overflow:hidden;
        box-shadow:0 8px 22px rgba(139,30,90,.045);
      }
      #recetas .auro-rx-editor-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        padding:11px 13px;
        border-bottom:2px solid #8b1e5a;
        background:linear-gradient(135deg,#ffffff,#fffafd);
      }
      #recetas .auro-rx-editor-head-title b{
        display:block;
        color:#8b1e5a;
        font-size:14px;
        font-weight:950;
        line-height:1.15;
      }
      #recetas .auro-rx-editor-head-title small{
        display:block;
        margin-top:2px;
        color:#64748b;
        font-size:10.5px;
        line-height:1.3;
      }
      #recetas .auro-rx-editor-add{
        flex:0 0 auto;
        min-height:38px!important;
        padding:7px 11px!important;
        border-radius:11px!important;
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        gap:6px!important;
        white-space:nowrap!important;
      }
      #recetas .auro-rx-editor-table-wrap{
        width:100%;
        overflow-x:auto;
        background:#fff;
      }
      #recetas .auro-rx-editor-table{
        width:100%;
        min-width:900px;
        border-collapse:collapse;
        table-layout:fixed;
        font-size:12px;
      }
      #recetas .auro-rx-editor-table col.auro-col-num{width:5%}
      #recetas .auro-rx-editor-table col.auro-col-med{width:22%}
      #recetas .auro-rx-editor-table col.auro-col-pres{width:22%}
      #recetas .auro-rx-editor-table col.auro-col-cant{width:10%}
      #recetas .auro-rx-editor-table col.auro-col-ind{width:36%}
      #recetas .auro-rx-editor-table col.auro-col-act{width:5%}
      #recetas .auro-rx-editor-table th{
        padding:7px 6px;
        border-right:1px solid #d8e0e5;
        border-bottom:1px solid #cbd5e1;
        background:#edf3f6;
        color:#263238;
        text-align:center;
        font-size:9.5px;
        font-weight:950;
        line-height:1.15;
        text-transform:uppercase;
        letter-spacing:.025em;
      }
      #recetas .auro-rx-editor-table th:last-child{border-right:0}
      #recetas .auro-rx-editor-main td{
        padding:7px 6px;
        vertical-align:top;
        border-right:1px solid #e1e7eb;
        background:#fff;
      }
      #recetas .auro-rx-editor-main td:last-child{border-right:0}
      #recetas .auro-rx-num{
        text-align:center;
        color:#8b1e5a;
        font-weight:950;
        padding-top:13px!important;
      }
      #recetas .auro-rx-editor-input,
      #recetas .auro-rx-editor-textarea,
      #recetas .auro-rx-editor-select{
        width:100%;
        min-height:36px!important;
        padding:7px 8px!important;
        border:1px solid transparent!important;
        border-radius:9px!important;
        background:#fff!important;
        color:#111827!important;
        box-shadow:none!important;
        font-size:12.5px!important;
        line-height:1.3!important;
      }
      #recetas .auro-rx-editor-med{font-weight:850!important}
      #recetas .auro-rx-editor-cantidad{text-align:center;font-weight:850!important}
      #recetas .auro-rx-editor-textarea{min-height:58px!important;resize:vertical!important}
      #recetas .auro-rx-editor-input:focus,
      #recetas .auro-rx-editor-textarea:focus,
      #recetas .auro-rx-editor-select:focus{
        border-color:#d89abd!important;
        box-shadow:0 0 0 3px rgba(194,59,131,.08)!important;
        outline:none!important;
      }
      #recetas .auro-rx-editor-remove{
        width:34px;height:34px;min-height:34px!important;
        padding:0!important;border-radius:9px!important;
        display:grid!important;place-items:center!important;
        margin:1px auto 0;
      }
      #recetas .auro-rx-editor-remove i{margin:0!important}
      #recetas .auro-rx-editor-detail td{
        padding:0 8px 9px;
        border-bottom:1px solid #e2e8f0;
        background:#fffafd;
      }
      #recetas .auro-rx-editor-detail-grid{
        display:grid;
        grid-template-columns:1.15fr 1.35fr 1.2fr .9fr;
        gap:8px;
        padding:8px;
        border:1px solid #f1e4ec;
        border-radius:11px;
        background:#fff;
      }
      #recetas .auro-rx-editor-detail-item label{
        display:block!important;
        margin:0 0 4px!important;
        color:#64748b!important;
        font-size:9.5px!important;
        font-weight:900!important;
        line-height:1.15!important;
        letter-spacing:.035em!important;
        text-transform:uppercase!important;
      }
      #recetas .auro-rx-editor-detail-item .auro-rx-editor-input,
      #recetas .auro-rx-editor-detail-item .auro-rx-editor-select{
        border-color:#e5e7eb!important;
      }
      #recetas .auro-rx-editor-empty{
        padding:22px 16px;
        text-align:center;
        color:#64748b;
        font-size:12.5px;
      }
      #recetas .auro-rx-editor-readonly-note{
        display:none;
        padding:8px 12px;
        border-top:1px solid #f1e4ec;
        background:#f8fafc;
        color:#64748b;
        font-size:10.5px;
        line-height:1.35;
      }
      #recetas .auro-rx-editor-shell[data-mode="lectura"] .auro-rx-editor-add,
      #recetas .auro-rx-editor-shell[data-mode="lectura"] .auro-rx-editor-remove{
        display:none!important;
      }
      #recetas .auro-rx-editor-shell[data-mode="lectura"] .auro-rx-editor-readonly-note{
        display:block;
      }
      #recetas .auro-rx-editor-shell[data-mode="lectura"] .auro-rx-editor-input,
      #recetas .auro-rx-editor-shell[data-mode="lectura"] .auro-rx-editor-textarea,
      #recetas .auro-rx-editor-shell[data-mode="lectura"] .auro-rx-editor-select{
        pointer-events:none!important;
        border-color:transparent!important;
        background:transparent!important;
      }

      /* recMedicamento se conserva como contrato canónico, oculto visualmente. */
      #recetas .auro-rx-canonical-hidden{
        position:absolute!important;
        width:1px!important;height:1px!important;min-height:1px!important;
        opacity:0!important;pointer-events:none!important;overflow:hidden!important;
        clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;
        white-space:nowrap!important;margin:0!important;padding:0!important;border:0!important;
      }
      #recetas .auro-rx-original-help{display:none!important}
      #recetas .auro-rx-secondary-block{
        margin-top:10px;
        padding:11px!important;
        border:1px solid #e5e7eb;
        border-radius:14px;
        background:#f8fafc;
      }
      #recetas .auro-rx-secondary-block textarea{
        min-height:82px!important;
        background:#fff!important;
      }
      #recetas .auro-rx-internal-label{
        display:inline-flex!important;
        align-items:center!important;
        gap:7px!important;
      }
      #recetas .auro-rx-internal-label:after{
        content:"Uso interno";
        display:inline-flex;
        align-items:center;
        padding:2px 7px;
        border-radius:999px;
        background:#e2e8f0;
        color:#475569;
        font-size:9px;
        font-weight:900;
      }

      @media(max-width:980px){
        #recetas .auro-rx-editor-detail-grid{
          grid-template-columns:repeat(2,minmax(0,1fr));
        }
      }
      @media(max-width:760px){
        #recetas .auro-rx-editor-table-wrap{overflow:visible}
        #recetas .auro-rx-editor-table{min-width:0;display:block}
        #recetas .auro-rx-editor-table colgroup,
        #recetas .auro-rx-editor-table thead{display:none}
        #recetas .auro-rx-editor-table tbody{display:block}
        #recetas .auro-rx-editor-main,
        #recetas .auro-rx-editor-detail{
          display:block;
          margin:10px;
          border:1px solid #e5e7eb;
          border-radius:14px;
          overflow:hidden;
          background:#fff;
        }
        #recetas .auro-rx-editor-main{
          padding:8px;
          box-shadow:0 5px 14px rgba(15,23,42,.045);
        }
        #recetas .auro-rx-editor-main td{
          display:block;
          width:100%!important;
          border:0!important;
          padding:5px 4px!important;
        }
        #recetas .auro-rx-editor-main td:before{
          display:block;
          margin:0 0 3px;
          color:#64748b;
          font-size:9px;
          font-weight:900;
          text-transform:uppercase;
          letter-spacing:.035em;
        }
        #recetas .auro-rx-editor-main td:nth-child(1):before{content:"N.º"}
        #recetas .auro-rx-editor-main td:nth-child(2):before{content:"Medicamento"}
        #recetas .auro-rx-editor-main td:nth-child(3):before{content:"Presentación / concentración"}
        #recetas .auro-rx-editor-main td:nth-child(4):before{content:"Cantidad"}
        #recetas .auro-rx-editor-main td:nth-child(5):before{content:"Indicaciones"}
        #recetas .auro-rx-editor-main td:nth-child(6):before{content:"Acción"}
        #recetas .auro-rx-num{text-align:left;padding-top:5px!important}
        #recetas .auro-rx-editor-remove{margin:0}
        #recetas .auro-rx-editor-detail{
          margin-top:-11px;
          border-top:0;
          border-radius:0 0 14px 14px;
        }
        #recetas .auro-rx-editor-detail td{
          display:block;
          padding:8px!important;
          border:0!important;
        }
        #recetas .auro-rx-editor-detail-grid{
          grid-template-columns:1fr 1fr;
        }
      }
      @media(max-width:520px){
        #recetas .auro-rx-editor-head{
          align-items:flex-start;
          flex-direction:column;
        }
        #recetas .auro-rx-editor-add{width:100%}
        #recetas .auro-rx-editor-detail-grid{grid-template-columns:1fr}
        #recetas .auro-rx-editor-main,
        #recetas .auro-rx-editor-detail{margin-left:7px;margin-right:7px}
      }

      @media(max-width:1180px){
        #recetas .auro-receta-main-actions{
          grid-template-columns:repeat(3,1fr)!important;
          width:100%!important;
          justify-content:stretch!important;
        }
        #recetas > .cardx > .section-head{
          align-items:flex-start!important;
          flex-wrap:wrap!important;
        }
        #recetas > .cardx > .section-head > div:first-child{
          width:100%!important;
        }
      }
      @media(max-width:980px){
        #recetas .auro-receta-context-grid{grid-template-columns:repeat(2,minmax(0,1fr));}
        #recetas .auro-receta-profesional-item{grid-column:1/-1!important;}
        #recetas .auro-receta-main-actions button{min-height:44px!important;}
      }
      @media(max-width:760px){
        #recetas .cardx{padding:14px!important;border-radius:18px!important;}
        #recetas .section-head{gap:10px!important;}
        #recetas .section-head h4{font-size:20px!important;line-height:1.08!important;}
        #recetas .auro-receta-main-actions{
          width:100%!important;
          grid-template-columns:1fr 1fr 1fr!important;
          gap:7px!important;
        }
        #recetas .auro-receta-main-actions button{
          min-width:0!important;
          padding:8px 7px!important;
          font-size:11.5px!important;
          white-space:normal!important;
        }
        #recetas .row.g-3{row-gap:10px!important;}
        #recMedicamento,#recIndicaciones,#recRecomendaciones{
          font-size:13px!important;
          padding:11px 12px!important;
          border-radius:15px!important;
        }
        #recMedicamento{min-height:132px!important;}
        #recIndicaciones{min-height:82px!important;}
        #recRecomendaciones{min-height:76px!important;}
        #recetas button{min-height:42px!important;white-space:normal!important;}
        #recetas .auro-receta-context-head{display:block;padding:13px 12px 10px;}
        #recetas .auro-receta-context-actions{justify-content:flex-start;margin-top:9px;}
        #recetas .auro-receta-context-grid{grid-template-columns:1fr 1fr;padding:0 12px 10px;}
        #recetas .auro-receta-context-item{padding:8px 8px 5px 0;}
        #recetas .auro-receta-context-name{font-size:17px!important;}
        #recetas .auro-receta-consulta-item{
          margin:4px 6px 4px 0!important;
          padding:8px!important;
        }
        #recetas .auro-receta-consulta-item b{font-size:16px!important;}
        #recetas .auro-receta-profesional-item{
          grid-column:1/-1!important;
          border-left:3px solid #ead5e2!important;
          padding-left:10px!important;
        }
        #recetas .auro-receta-modebar{display:block;font-size:12px;}
        #recetas .auro-receta-modebar .badge-auro{display:inline-block;margin-top:6px;}
      }
      @media(max-width:520px){
        #recetas .auro-receta-main-actions{
          grid-template-columns:1fr!important;
          gap:7px!important;
        }
        #recetas .auro-receta-main-actions button{
          width:100%!important;
          min-height:43px!important;
          font-size:12.5px!important;
          white-space:normal!important;
        }
        #recetas .auro-receta-context-grid{
          grid-template-columns:1fr 1fr!important;
        }
        #recetas .auro-receta-consulta-item{
          grid-column:1/-1!important;
          margin-right:0!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function auroRecetaEditorObjetoDesdeItem(item){
    if(!item) return {
      med:'', pres:'', via:'', cantidad:'', frec:'', dur:'', ind:'', continuo:'No',
      __legacy:false, __legacyText:''
    };

    if(item.texto){
      const raw = String(item.texto || '').replace(/^\s*\d+\.\s*/, '').trim();
      const interpretado = recetaMedicamentoTextoAObjeto(raw);

      if(interpretado && !interpretado.texto){
        return {
          ...normalizarMedicamentoRecetaObjeto(interpretado),
          __legacy:false,
          __legacyText:''
        };
      }

      return {
        med:raw, pres:'', via:'', cantidad:'', frec:'', dur:'', ind:'', continuo:'No',
        __legacy:true, __legacyText:raw
      };
    }

    return {
      ...normalizarMedicamentoRecetaObjeto(item),
      __legacy:false,
      __legacyText:''
    };
  }

  function auroRecetaEditorLeerCampoCanonico(){
    /*
      Fuente única: recMedicamento.
      Plan ya sincroniza ese campo mediante sincronizarPlanConReceta();
      edición histórica carga en él el JSON guardado. De esta forma
      el editor no crea una segunda ruta de datos ni sustituye recetas.
    */
    const campo = el('recMedicamento');
    if(!campo) return [];

    return recetaMedicamentosALista(campo.value || '')
      .map(auroRecetaEditorObjetoDesdeItem)
      .filter(m => String(m.med || m.__legacyText || '').trim());
  }

  function auroRecetaEditorDatoPersistible(m){
    m = m || {};

    if(
      m.__legacy &&
      String(m.__legacyText || '').trim() &&
      String(m.med || '').trim() === String(m.__legacyText || '').trim() &&
      !String(m.pres || '').trim() &&
      !String(m.via || '').trim() &&
      !String(m.cantidad || '').trim() &&
      !String(m.frec || '').trim() &&
      !String(m.dur || '').trim() &&
      !String(m.ind || '').trim() &&
      String(m.continuo || 'No') !== 'Sí'
    ){
      return {texto:String(m.__legacyText || '').trim()};
    }

    return normalizarMedicamentoRecetaObjeto(m);
  }

  function auroRecetaEditorSincronizarCampoCanonico(){
    const campo = el('recMedicamento');
    if(!campo || !recetaEditorTratamientoMontado) return '';

    const lista = recetaEditorMedicamentos
      .map(auroRecetaEditorDatoPersistible)
      .filter(m => m && (String(m.texto || '').trim() || String(m.med || '').trim()));

    const valor = lista.length ? JSON.stringify(lista) : '';
    campo.value = valor;
    return valor;
  }

  function auroRecetaEditorSetDato(index, clave, valor){
    const i = Number(index);
    if(!Number.isInteger(i) || !recetaEditorMedicamentos[i]) return;

    recetaEditorMedicamentos[i][clave] = String(valor ?? '');
    recetaEditorMedicamentos[i].__legacy = false;
    recetaEditorTratamientoSucio = true;
    auroRecetaEditorSincronizarCampoCanonico();

    if(recetaPreviewVisible){
      clearTimeout(window.__auroRecetaPreviewTimer);
      window.__auroRecetaPreviewTimer = setTimeout(window.vistaPreviaReceta, 220);
    }
  }

  function auroRecetaEditorAgregarMedicamento(){
    if(recetaModoTrabajo === 'lectura') return;

    recetaEditorMedicamentos.push({
      med:'', pres:'', via:'', cantidad:'', frec:'', dur:'', ind:'', continuo:'No',
      __legacy:false, __legacyText:''
    });
    recetaEditorTratamientoSucio = true;
    auroRecetaEditorRenderFilas();
  }

  function auroRecetaEditorEliminarMedicamento(index){
    if(recetaModoTrabajo === 'lectura') return;

    const i = Number(index);
    if(!Number.isInteger(i) || !recetaEditorMedicamentos[i]) return;

    recetaEditorMedicamentos.splice(i,1);
    recetaEditorTratamientoSucio = true;
    auroRecetaEditorSincronizarCampoCanonico();
    auroRecetaEditorRenderFilas();
  }

  function auroRecetaEditorFilasHTML(){
    if(!recetaEditorMedicamentos.length){
      return '<tr><td colspan="6"><div class="auro-rx-editor-empty">No hay medicamentos cargados en esta receta.</div></td></tr>';
    }

    return recetaEditorMedicamentos.map((m,index) => {
      const n = index + 1;
      const continuo = String(m.continuo || 'No') === 'Sí' ? 'Sí' : 'No';

      return `
        <tr class="auro-rx-editor-main">
          <td class="auro-rx-num">${n}</td>
          <td><input class="auro-rx-editor-input auro-rx-editor-med" value="${safe(m.med || '')}" oninput="window.auroRecetaEditorSetDato(${index},'med',this.value)"></td>
          <td><input class="auro-rx-editor-input" value="${safe(m.pres || '')}" oninput="window.auroRecetaEditorSetDato(${index},'pres',this.value)"></td>
          <td><input class="auro-rx-editor-input auro-rx-editor-cantidad" value="${safe(m.cantidad || '')}" oninput="window.auroRecetaEditorSetDato(${index},'cantidad',this.value)"></td>
          <td><textarea class="auro-rx-editor-textarea" oninput="window.auroRecetaEditorSetDato(${index},'ind',this.value)">${safe(m.ind || '')}</textarea></td>
          <td>
            <button type="button" class="btn-soft auro-rx-editor-remove" title="Quitar medicamento" onclick="window.auroRecetaEditorEliminarMedicamento(${index})">
              <i class="bi bi-trash3"></i>
            </button>
          </td>
        </tr>
        <tr class="auro-rx-editor-detail">
          <td colspan="6">
            <div class="auro-rx-editor-detail-grid">
              <div class="auro-rx-editor-detail-item">
                <label>Vía</label>
                <input class="auro-rx-editor-input" value="${safe(m.via || '')}" placeholder="Ej. Vía oral" oninput="window.auroRecetaEditorSetDato(${index},'via',this.value)">
              </div>
              <div class="auro-rx-editor-detail-item">
                <label>Frecuencia</label>
                <input class="auro-rx-editor-input" value="${safe(m.frec || '')}" placeholder="Ej. Cada 24 horas" oninput="window.auroRecetaEditorSetDato(${index},'frec',this.value)">
              </div>
              <div class="auro-rx-editor-detail-item">
                <label>Duración</label>
                <input class="auro-rx-editor-input" value="${safe(m.dur || '')}" placeholder="Ej. 30 días" oninput="window.auroRecetaEditorSetDato(${index},'dur',this.value)">
              </div>
              <div class="auro-rx-editor-detail-item">
                <label>Continuo</label>
                <select class="auro-rx-editor-select" onchange="window.auroRecetaEditorSetDato(${index},'continuo',this.value)">
                  <option value="No" ${continuo === 'No' ? 'selected' : ''}>No</option>
                  <option value="Sí" ${continuo === 'Sí' ? 'selected' : ''}>Sí</option>
                </select>
              </div>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  function auroRecetaEditorRenderFilas(){
    const body = el('auroRecetaEditorBody');
    const shell = el('auroRecetaEditorTratamiento');

    if(shell){
      shell.setAttribute('data-mode', String(recetaModoTrabajo || 'lectura'));
    }
    if(body){
      body.innerHTML = auroRecetaEditorFilasHTML();
    }

    auroRecetaEditorActualizarModo();
    auroRecetaEditorSincronizarCampoCanonico();
  }

  function auroRecetaEditorRenderDesdeCampo(forzar){
    if(!recetaEditorTratamientoMontado) return;
    if(recetaEditorTratamientoSucio && !forzar) return;

    recetaEditorMedicamentos = auroRecetaEditorLeerCampoCanonico();
    recetaEditorTratamientoSucio = false;
    auroRecetaEditorRenderFilas();
  }

  function auroRecetaEditorActualizarModo(){
    const shell = el('auroRecetaEditorTratamiento');
    if(shell){
      shell.setAttribute('data-mode', String(recetaModoTrabajo || 'lectura'));
    }

    document.querySelectorAll(
      '#auroRecetaEditorTratamiento .auro-rx-editor-input,' +
      '#auroRecetaEditorTratamiento .auro-rx-editor-textarea,' +
      '#auroRecetaEditorTratamiento .auro-rx-editor-select'
    ).forEach(campo => {
      campo.disabled = recetaModoTrabajo === 'lectura';
    });
  }

  function auroRecetaEditorMontar(){
    if(recetaEditorTratamientoMontado) {
      auroRecetaEditorActualizarModo();
      return;
    }

    const campo = el('recMedicamento');
    if(!campo) return;

    const narrow = campo.closest('.hc-plan-narrow');
    if(!narrow) return;

    const label = narrow.querySelector('label');
    const ayuda = narrow.querySelector('.form-text');

    if(label) label.style.display = 'none';
    if(ayuda) ayuda.classList.add('auro-rx-original-help');

    campo.classList.add('auro-rx-canonical-hidden');
    campo.setAttribute('aria-hidden','true');
    campo.tabIndex = -1;

    const shell = document.createElement('div');
    shell.id = 'auroRecetaEditorTratamiento';
    shell.className = 'auro-rx-editor-shell';
    shell.setAttribute('data-mode', String(recetaModoTrabajo || 'lectura'));
    shell.innerHTML = `
      <div class="auro-rx-editor-head">
        <div class="auro-rx-editor-head-title">
          <b>Tratamiento prescrito</b>
          <small>Misma jerarquía del formato oficial: medicamento, presentación/concentración, cantidad e indicaciones.</small>
        </div>
        <button type="button" class="btn-soft auro-rx-editor-add" onclick="window.auroRecetaEditorAgregarMedicamento()">
          <i class="bi bi-plus-circle"></i> Agregar medicamento
        </button>
      </div>
      <div class="auro-rx-editor-table-wrap">
        <table class="auro-rx-editor-table" aria-label="Editor de tratamiento prescrito">
          <colgroup>
            <col class="auro-col-num"><col class="auro-col-med"><col class="auro-col-pres">
            <col class="auro-col-cant"><col class="auro-col-ind"><col class="auro-col-act">
          </colgroup>
          <thead>
            <tr>
              <th>N.º</th><th>Medicamento</th><th>Presentación / concentración</th>
              <th>Cantidad</th><th>Indicaciones</th><th></th>
            </tr>
          </thead>
          <tbody id="auroRecetaEditorBody"></tbody>
        </table>
      </div>
      <div class="auro-rx-editor-readonly-note">
        <i class="bi bi-lock me-1"></i> Modo lectura. Use <b>Editar receta</b> para modificar el tratamiento.
      </div>`;

    narrow.insertBefore(shell,campo);
    recetaEditorTratamientoMontado = true;

    const indicaciones = el('recIndicaciones');
    const recomendaciones = el('recRecomendaciones');

    if(indicaciones){
      const col = indicaciones.closest('.col-12');
      const l = indicaciones.closest('.hc-plan-narrow')?.querySelector('label');
      if(col) col.classList.add('auro-rx-secondary-block');
      if(l) l.textContent = 'Indicaciones generales para el paciente';
    }

    if(recomendaciones){
      const col = recomendaciones.closest('.col-12');
      const l = recomendaciones.closest('.hc-plan-narrow')?.querySelector('label');
      if(col) col.classList.add('auro-rx-secondary-block');
      if(l){
        l.textContent = 'Observaciones internas / recomendaciones';
        l.classList.add('auro-rx-internal-label');
      }
    }

    auroRecetaEditorRenderDesdeCampo(true);
  }

  function auroRecetaAfinarInterfazPremium(){
    const seccion = el('recetas');
    if(!seccion) return;

    const head = seccion.querySelector(':scope > .cardx > .section-head');
    if(head){
      const titulo = head.querySelector('h4');
      const subtitulo = head.querySelector('p');
      const acciones = head.querySelector('.d-flex');

      if(titulo) titulo.textContent = 'Prescripción clínica';
      if(subtitulo) subtitulo.textContent = 'Emisión, revisión e impresión de la prescripción asociada a la atención activa.';

      if(acciones){
        acciones.classList.add('auro-receta-main-actions');

        const pdf = acciones.querySelector('button[onclick*="auroRecetaAbrirOficialDesdeIndex"]');
        if(pdf){
          pdf.id = 'btnPdfRecetaOficial';
          pdf.setAttribute('data-auro-receta-action','pdf');
          pdf.innerHTML = '<i class="bi bi-filetype-pdf"></i> PDF / imprimir';
        }

        const guardar = acciones.querySelector('button[onclick*="guardarRecetaERP"]');
        if(guardar){
          guardar.setAttribute('data-auro-receta-action','guardar');
        }
      }
    }

    const nota = seccion.querySelector(':scope > .cardx > .clinical-note.mt-3');
    if(nota){
      nota.innerHTML = '<i class="bi bi-info-circle me-1"></i> La prescripción se conserva como un único documento clínico asociado a la atención activa, aunque incluya varios medicamentos.';
    }

    auroRecetaEditorMontar();
  }

  function recetaMedicamentosPlanActualesSeguros(){
    const idAtencionActual = obtenerIdAtencionActivaSeguro();
    const idAtencionPlan = String(window.planState?.atencionActual || recetaPlanAtencionId || '').trim();

    if(!idAtencionActual || !idAtencionPlan || idAtencionActual !== idAtencionPlan){
      return [];
    }

    const meds = Array.isArray(window.medicamentosPlanSeleccionados)
      ? window.medicamentosPlanSeleccionados
      : [];

    return meds
      .map(normalizarMedicamentoRecetaObjeto)
      .filter(m => String(m.med || m.texto || '').trim());
  }

  function recetaPlanPerteneceAtencionActiva(){
    const idAtencionActual = String(obtenerIdAtencionActivaSeguro() || '').trim();
    const idAtencionPlan = String(window.planState?.atencionActual || recetaPlanAtencionId || '').trim();
    return !!(idAtencionActual && idAtencionPlan && idAtencionActual === idAtencionPlan);
  }

  function recetaTieneMedicamentosReales(valor){
    return recetaMedicamentosALista(valor).some(item => {
      if(item && item.texto){
        return String(item.texto || '').replace(/^\s*\d+\.\s*/, '').trim();
      }
      const m = normalizarMedicamentoRecetaObjeto(item || {});
      return String(m.med || '').trim();
    });
  }

  function limpiarFormularioRecetaPorCambioAtencion(){
    recetaEditandoId = null;
    recetaNuevaForzada = false;
    recetaModoTrabajo = 'lectura';
    recetaEstadoVisual = '';
    auroRecetaMostrarPreview(false);
    recetaBloqueoPostGuardadoHasta = 0;
    if(recetaEstadoTimer){ clearTimeout(recetaEstadoTimer); recetaEstadoTimer = null; }

    setVal('recFecha', fechaHoyReceta());
    setVal('recEstado', 'Emitida');
    setVal('recCie10', '');
    setVal('recDiagnostico', '');
    setVal('recMedicamento', '');
    setVal('recIndicaciones', '');
    setVal('recRecomendaciones', '');

    /* No se borran arrays del Plan: únicamente se corta la reutilización
       de datos hasta que el Plan corresponda a la nueva atención. */
    recetaPlanAtencionId = String(window.planState?.atencionActual || '').trim();
    actualizarBotonGuardarReceta();
    auroRecetaEditorRenderDesdeCampo(true);

    const box = el('recetaPreview');
    if(box){
      box.innerHTML = '<div class="text-muted text-center py-4">Nueva consulta activa. La receta quedó limpia y solo cargará medicamentos cuando el Plan corresponda a esta atención.</div>';
    }

    cargarMedicosActivosReceta(false).then(function(){
      sincronizarMedicoRecetaDesdeAtencion();
    });
  }

  function medicamentoRecetaParaGuardarJSON(textoFormulario){
    const actual = String(textoFormulario || '').trim();

    if(medicamentoRecetaEsJSON(actual)){
      return actual;
    }

    const medsPlan = recetaMedicamentosPlanActualesSeguros();

    if(medsPlan.length){
      return JSON.stringify(medsPlan);
    }

    if(!actual) return '';

    const bloques = actual.split(/\n\s*\n+/).map(x => x.trim()).filter(Boolean);
    const lineas = bloques.length > 1 ? bloques : actual.split(/\n+/).map(x => x.trim()).filter(Boolean);

    return JSON.stringify(lineas.map(x => ({
      texto: x.replace(/^\s*\d+\.\s*/, '').replace(/\n\s*/g, ' · ')
    })));
  }

  function fechaVisual(fecha){
    if(!fecha) return '';
    const s = String(fecha);
    if(/^\d{4}-\d{2}-\d{2}/.test(s)){
      const p = s.slice(0,10).split('-');
      return `${p[2]}/${p[1]}/${p[0]}`;
    }
    return s;
  }

  function recetaIdMedicoRegistro(m){
    return String(m?.id_medico || m?.id || m?.codigo || '').trim();
  }

  function recetaNombreMedicoRegistro(m){
    return String(
      m?.nombre_completo ||
      m?.nombre ||
      ((m?.nombres || '') + ' ' + (m?.apellidos || ''))
    ).replace(/\s+/g,' ').trim();
  }

  async function cargarMedicosActivosReceta(forzar){
    if(recetaMedicosCargados && !forzar) return recetaMedicosActivos;
    if(recetaMedicosCargando) return recetaMedicosCargando;

    recetaMedicosCargando = (async function(){
      try{
        if(typeof API_URL === 'undefined' || !API_URL){
          throw new Error('API_URL no está definida.');
        }

        const res = await fetch(API_URL + '?accion=listarMedicosActivos&_=' + Date.now());
        if(!res.ok) throw new Error('Error HTTP ' + res.status);

        const data = await res.json();
        recetaMedicosActivos = Array.isArray(data)
          ? data
          : (Array.isArray(data?.data) ? data.data : []);

        recetaMedicosActivos = recetaMedicosActivos.filter(function(m){
          return !!recetaIdMedicoRegistro(m);
        });

        recetaMedicosCargados = true;
        return recetaMedicosActivos;
      }catch(error){
        recetaMedicosActivos = [];
        recetaMedicosCargados = false;
        console.warn('IASYN RECETAS: no se pudieron cargar médicos activos.', error);
        return [];
      }finally{
        recetaMedicosCargando = null;
      }
    })();

    return recetaMedicosCargando;
  }

  function obtenerMedicoDesdeAtencionActiva(){
    try{
      const atencion = obtenerAtencionActivaSegura();
      if(!atencion) return { id_medico:'', nombre:'', registro:null };

      const idMedico = String(atencion.id_medico || atencion.medico_id || '').trim();
      if(!idMedico) return { id_medico:'', nombre:'', registro:null };

      const listas = [
        recetaMedicosActivos,
        window.medicos,
        window.medicosActivos,
        window.listaMedicos,
        window.configuracionMedicos,
        window.medicosConfiguracion
      ].filter(Array.isArray);

      let encontrado = null;
      for(const lista of listas){
        encontrado = lista.find(function(m){
          return recetaIdMedicoRegistro(m) === idMedico;
        }) || null;
        if(encontrado) break;
      }

      return {
        id_medico: idMedico,
        nombre: recetaNombreMedicoRegistro(encontrado),
        registro: encontrado || null
      };
    }catch(error){
      console.warn('IASYN RECETAS: no se pudo resolver médico de la atención.', error);
      return { id_medico:'', nombre:'', registro:null };
    }
  }

  function sincronizarMedicoRecetaDesdeAtencion(){
    const medico = obtenerMedicoDesdeAtencionActiva();
    if(medico.nombre){
      setVal('recMedico', medico.nombre);
    }
    return medico;
  }

  function obtenerNombreMedicoReal(){
    const desdeAtencion = obtenerMedicoDesdeAtencionActiva();
    if(desdeAtencion.nombre) return desdeAtencion.nombre;
    const campo = val('recMedico');
    if(campo) return campo;
    return 'Profesional tratante';
  }

  function obtenerIdMedicoReal(){
    try{
      const desdeAtencion = obtenerMedicoDesdeAtencionActiva();
      if(desdeAtencion.id_medico) return desdeAtencion.id_medico;

      if(typeof window.idMedicoActual === 'string' && window.idMedicoActual.trim()){
        return window.idMedicoActual.trim();
      }

      if(typeof window.getMedicoActivo === 'function'){
        const m = window.getMedicoActivo();
        const id = recetaIdMedicoRegistro(m);
        if(id) return id;
      }

      return '';
    }catch(error){
      console.warn('IASYN RECETAS: no se pudo obtener id_medico real.', error);
      return '';
    }
  }

  function obtenerCodigoCortoMedico(idMedicoOpcional){
    try{
      const idMedico = String(idMedicoOpcional || obtenerIdMedicoReal() || '').trim();
      const partes = idMedico.split('-').filter(Boolean);
      const ultimo = partes.length ? partes[partes.length - 1] : idMedico;
      const limpio = String(ultimo || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

      return limpio || 'SINMEDICO';

    }catch(e){
      return 'SINMEDICO';
    }
  }

  function crearIdReceta(idMedicoOpcional){
    const d = new Date();

    const fecha =
      d.getFullYear() +
      String(d.getMonth() + 1).padStart(2,'0') +
      String(d.getDate()).padStart(2,'0');

    const hora =
      String(d.getHours()).padStart(2,'0') +
      String(d.getMinutes()).padStart(2,'0') +
      String(d.getSeconds()).padStart(2,'0');

    const codigoMedico = obtenerCodigoCortoMedico(idMedicoOpcional);
    const control = String(Math.floor(Math.random() * 90) + 10);

    return 'REC-' + fecha + '-' + hora + '-' + codigoMedico + '-' + control;
  }

  function obtenerPacienteActivoSeguro(){
    try{ if(typeof getPacienteActivo === 'function') return getPacienteActivo(); }catch(e){}
    return null;
  }

  function coincideConPacienteActivo(receta){
    const paciente = obtenerPacienteActivoSeguro();
    if(!paciente) return false;

    const idPaciente = String(paciente.id_paciente || paciente.id || '').trim();
    const cedulaPaciente = String(paciente.cedula || paciente.numero_documento || paciente.documento || '').replace(/\D/g,'');
    const nombrePaciente = String(paciente.nombre || ((paciente.nombres || '') + ' ' + (paciente.apellidos || '')))
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');

    const idRecetaPaciente = String(receta.id_paciente || '').trim();
    const cedulaReceta = String(receta.paciente_cedula || receta.cedula || receta.numero_documento || '').replace(/\D/g,'');
    const nombreReceta = String(receta.paciente_nombre || receta.paciente || receta.nombre || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');

    return (
      (idPaciente && idRecetaPaciente && idPaciente === idRecetaPaciente) ||
      (cedulaPaciente && cedulaReceta && cedulaPaciente === cedulaReceta) ||
      (nombrePaciente && nombreReceta && nombrePaciente === nombreReceta)
    );
  }


  function obtenerAtencionActivaSegura(){
    try{
      if(typeof window.getAtencionActiva === 'function'){
        const a = window.getAtencionActiva();
        if(a && (a.id_atencion || a.id)) return a;
      }
    }catch(e){
      console.warn('No se pudo obtener la atención activa.', e);
    }
    return null;
  }

  function obtenerIdAtencionActivaSeguro(){
    try{
      const atencion = obtenerAtencionActivaSegura();
      if(atencion){
        return String(atencion.id_atencion || atencion.id || '').trim();
      }

      if(typeof window.getIdAtencionActiva === 'function'){
        return String(window.getIdAtencionActiva() || '').trim();
      }

      return String(
        window.planState?.atencionActual ||
        window.examenFisicoState?.atencionActual ||
        ''
      ).trim();
    }catch(e){
      console.warn('No se pudo obtener id_atencion activo.', e);
      return '';
    }
  }

  async function auroRecetaConsultarDiagnosticosAtencion(idAtencion, forzar){
    idAtencion = String(idAtencion || '').trim();
    if(!idAtencion) return [];

    if(!forzar && recetaDiagnosticosPorAtencionCache.has(idAtencion)){
      return recetaDiagnosticosPorAtencionCache.get(idAtencion);
    }

    if(typeof API_URL === 'undefined' || !API_URL) return [];

    try{
      const url = API_URL +
        '?accion=listarDiagnosticosPorAtencion&id_atencion=' +
        encodeURIComponent(idAtencion) +
        '&_=' + Date.now();

      const res = await fetch(url);
      const data = await res.json();
      const lista = Array.isArray(data)
        ? data
        : (Array.isArray(data?.data) ? data.data : []);

      recetaDiagnosticosPorAtencionCache.set(idAtencion, lista);
      return lista;
    }catch(error){
      console.warn('IASYN RECETAS: no se pudieron consultar diagnósticos de la atención.', error);
      return [];
    }
  }

  /* =====================================================
     IASYN RECETAS 2.8 - MULTIDIAGNÓSTICO + PRESENTACIÓN HORIZONTAL
     ---------------------------------------------------------
     - Diagnóstico sigue siendo la fuente clínica oficial.
     - La receta conserva diagnostico_cie10 principal para compatibilidad.
     - La representación oficial muestra TODOS los diagnósticos activos
       de la misma id_atencion, principal primero.
     - No depende de que un protocolo haya sido aplicado al Plan.
     - No agrega columnas ni modifica Google Sheets o Apps Script.
  ===================================================== */
  function auroRecetaDiagnosticosNormalizados(lista){
    const salida = [];
    const vistos = new Set();

    (Array.isArray(lista) ? lista : []).forEach(function(dx, index){
      dx = dx || {};
      const estado = recetaNormalizarPlano(dx.estado || 'Activo');
      if(['inactivo','inactiva','anulado','anulada','eliminado','eliminada'].includes(estado)) return;

      const codigo = String(
        dx.codigo_cie10 || dx.diagnostico_cie10 || dx.cie10 || dx.codigo || ''
      ).trim();
      const descripcion = String(
        dx.descripcion || dx.diagnostico || dx.nombre || dx.detalle || ''
      ).trim();
      if(!codigo && !descripcion) return;

      const principal = dx.principal === true ||
        ['SI','SÍ','TRUE','1'].includes(String(dx.principal || '').trim().toUpperCase());
      const clave = [auroRecetaCodigoNormalizado(codigo), recetaNormalizarPlano(descripcion)].join('|');
      if(!clave.replace('|','') || vistos.has(clave)) return;
      vistos.add(clave);

      const codigoNorm = auroRecetaCodigoNormalizado(codigo);
      const descripcionNorm = auroRecetaCodigoNormalizado(descripcion);
      const textoDx = codigo && descripcion && !descripcionNorm.includes(codigoNorm)
        ? `${codigo} - ${descripcion}`
        : (descripcion || codigo);

      salida.push({
        id_diagnostico:String(dx.id_diagnostico || '').trim(),
        codigo:codigo,
        descripcion:descripcion,
        texto:textoDx,
        principal:principal,
        tipo_diagnostico:String(dx.tipo_diagnostico || dx.tipo || '').trim(),
        orden_original:index
      });
    });

    if(salida.length && !salida.some(x => x.principal)) salida[0].principal = true;

    return salida.sort(function(a,b){
      if(a.principal !== b.principal) return Number(b.principal) - Number(a.principal);
      return a.orden_original - b.orden_original;
    });
  }

  function auroRecetaDiagnosticosActualesSincronos(idAtencion){
    const id = String(idAtencion || '').trim();
    const fuentes = [];

    try{
      if(window.auroDiagnosticos && typeof window.auroDiagnosticos.obtenerDiagnosticos === 'function'){
        const lista = window.auroDiagnosticos.obtenerDiagnosticos();
        if(Array.isArray(lista)) fuentes.push(lista);
      }
    }catch(e){}

    if(Array.isArray(window.auroDiagnosticosState?.diagnosticos)){
      fuentes.push(window.auroDiagnosticosState.diagnosticos);
    }
    if(Array.isArray(window.hcDiagnosticosSeleccionados)){
      fuentes.push(window.hcDiagnosticosSeleccionados);
    }

    for(const fuente of fuentes){
      const filtrada = fuente.filter(function(dx){
        const dxAtencion = String(dx?.id_atencion || '').trim();
        return !id || !dxAtencion || dxAtencion === id;
      });
      const normalizados = auroRecetaDiagnosticosNormalizados(filtrada);
      if(normalizados.length) return normalizados;
    }

    return [];
  }

  async function auroRecetaAdjuntarDiagnosticosAtencion(receta, forzar){
    receta = receta || {};
    const idAtencion = String(receta.id_atencion || obtenerIdAtencionActivaSeguro() || '').trim();
    if(!idAtencion) return receta;

    let lista = await auroRecetaConsultarDiagnosticosAtencion(idAtencion, forzar === true);
    let diagnosticos = auroRecetaDiagnosticosNormalizados(lista);

    if(!diagnosticos.length){
      diagnosticos = auroRecetaDiagnosticosActualesSincronos(idAtencion);
    }

    if(diagnosticos.length){
      receta.diagnosticos = diagnosticos;
      const principal = diagnosticos.find(x => x.principal) || diagnosticos[0];

      if(!String(receta.cie10 || receta.diagnostico_cie10 || '').trim()){
        receta.cie10 = principal.codigo || '';
        receta.diagnostico_cie10 = principal.codigo || '';
      }

      if(!String(receta.diagnostico || '').trim() || auroRecetaDiagnosticoGenerico(receta.diagnostico)){
        receta.diagnostico = principal.texto || '';
      }
    }

    return receta;
  }

  function auroRecetaDiagnosticosRepresentacionHTML(r){
    const lista = auroRecetaDiagnosticosNormalizados(r?.diagnosticos || []);

    if(!lista.length){
      return `<b>${safe(r?.diagnostico || '—')}</b>`;
    }

    return `<div class="auro-rx-diagnosticos-lista">${lista.map(function(dx){
      return `<div class="auro-rx-diagnostico-linea ${dx.principal ? 'principal' : ''}">
        <b>${safe(dx.texto || '—')}</b>
      </div>`;
    }).join('')}</div>`;
  }

  /*
     IASYN RECETAS 2.8 - PRESENTACIÓN MULTIDIAGNÓSTICO QUIRÚRGICA
     - Un solo diagnóstico conserva la cabecera histórica.
     - Con dos o más, la cabecera muestra solo el principal.
     - Todos los diagnósticos se muestran en una franja horizontal
       inmediatamente después del tratamiento prescrito.
     - No modifica la fuente de diagnósticos, guardado, historial ni backend.
  */
  function auroRecetaDiagnosticosListaImpresion(r){
    return auroRecetaDiagnosticosNormalizados(r?.diagnosticos || []);
  }

  function auroRecetaDiagnosticoCabeceraPacienteHTML(r){
    const lista = auroRecetaDiagnosticosListaImpresion(r);
    if(!lista.length) return `<b>${safe(r?.diagnostico || '—')}</b>`;

    const principal = lista.find(dx => dx.principal) || lista[0];
    return `<b>${safe(principal?.texto || r?.diagnostico || '—')}</b>`;
  }

  function auroRecetaTipoDiagnosticoVisual(valor){
    const n = recetaNormalizarPlano(valor);
    if(n === 'definitivo') return 'Definitivo';
    if(n === 'presuntivo') return 'Presuntivo';
    return String(valor || '').trim();
  }

  function auroRecetaDiagnosticoUnicoPacienteHTML(r){
    const lista = auroRecetaDiagnosticosListaImpresion(r);
    if(lista.length > 1) return '';

    let codigo = '';
    let descripcion = '';
    let tipo = '';
    let jerarquia = '';

    if(lista.length === 1){
      const dx = lista[0] || {};
      codigo = String(dx.codigo || '').trim();
      descripcion = String(dx.descripcion || dx.texto || '').trim();
      tipo = auroRecetaTipoDiagnosticoVisual(dx.tipo_diagnostico);
      jerarquia = dx.principal ? 'Principal' : 'Asociado';
    }else{
      codigo = String(r?.cie10 || r?.diagnostico_cie10 || '').trim();
      descripcion = String(r?.diagnostico || '').trim();
    }

    if(!codigo && !descripcion) return '';

    return `
      <div class="auro-receta-section auro-rx-diagnostico-unico-section">
        <h4>Diagnóstico de la atención</h4>
        <div class="auro-rx-diagnostico-unico">
          ${codigo ? `<strong>${safe(codigo)}</strong>` : ''}
          ${jerarquia ? `<span class="auro-rx-dx-jerarquia">${safe(jerarquia)}</span>` : ''}
          ${tipo ? `<span class="auro-rx-dx-tipo ${recetaNormalizarPlano(tipo) === 'definitivo' ? 'definitivo' : ''}">${safe(tipo)}</span>` : ''}
          ${descripcion ? `<span class="auro-rx-diagnostico-unico-name">${safe(descripcion)}</span>` : ''}
        </div>
      </div>`;
  }

  function auroRecetaDiagnosticosMultiplesPacienteHTML(r){
    const lista = auroRecetaDiagnosticosListaImpresion(r);
    if(lista.length <= 1) return '';

    const columnas = Math.min(Math.max(lista.length, 2), 3);

    return `
      <div class="auro-receta-section auro-rx-diagnosticos-section">
        <h4>Diagnósticos de la atención</h4>
        <div class="auro-rx-diagnosticos-grid" style="--auro-rx-dx-cols:${columnas}">
          ${lista.map(function(dx){
            const tipo = auroRecetaTipoDiagnosticoVisual(dx.tipo_diagnostico);
            return `
              <div class="auro-rx-diagnostico-card ${dx.principal ? 'principal' : 'asociado'}">
                <div class="auro-rx-diagnostico-card-head">
                  <strong>${safe(dx.codigo || 'S/C')}</strong>
                  <span class="auro-rx-dx-jerarquia">${dx.principal ? 'Principal' : 'Asociado'}</span>
                  ${tipo ? `<span class="auro-rx-dx-tipo ${recetaNormalizarPlano(tipo) === 'definitivo' ? 'definitivo' : ''}">${safe(tipo)}</span>` : ''}
                </div>
                <div class="auro-rx-diagnostico-card-name">${safe(dx.descripcion || dx.texto || '—')}</div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function auroRecetaObtenerDiagnosticoEstructurado(lista, cie){
    const cieNorm = auroRecetaCodigoNormalizado(cie);
    const items = Array.isArray(lista) ? lista : [];

    const coincidentes = items.filter(dx => {
      const codigo = auroRecetaCodigoNormalizado(
        dx.codigo_cie10 || dx.diagnostico_cie10 || dx.cie10 || dx.codigo || ''
      );
      return !cieNorm || codigo === cieNorm;
    });

    const principal =
      coincidentes.find(dx => String(dx.principal || '').toUpperCase() === 'SI') ||
      coincidentes[0] ||
      items.find(dx => String(dx.principal || '').toUpperCase() === 'SI') ||
      items[0];

    if(!principal) return null;

    const codigo = String(
      principal.codigo_cie10 ||
      principal.diagnostico_cie10 ||
      principal.cie10 ||
      principal.codigo ||
      cie ||
      ''
    ).trim();

    const descripcion = String(
      principal.descripcion ||
      principal.diagnostico ||
      principal.nombre ||
      principal.detalle ||
      ''
    ).trim();

    if(!codigo || !auroRecetaCodigoNormalizado(codigo)) return null;
    if(!descripcion || auroRecetaDiagnosticoGenerico(descripcion)) return null;

    const codigoNorm = auroRecetaCodigoNormalizado(codigo);
    const descripcionNorm = auroRecetaCodigoNormalizado(descripcion);
    const texto = codigo && !descripcionNorm.includes(codigoNorm)
      ? `${codigo} - ${descripcion}`
      : descripcion;

    return { codigo, descripcion, texto, registro: principal };
  }

  function auroRecetaElegirDiagnosticoEstructurado(lista, cie){
    const diagnostico = auroRecetaObtenerDiagnosticoEstructurado(lista, cie);
    return diagnostico ? diagnostico.texto : '';
  }

  async function auroRecetaResolverDiagnosticoEstructurado(){
    const idAtencion = obtenerIdAtencionActivaSeguro();
    const cie = val('recCie10') || val('hcCie10Principal');

    if(!idAtencion) return auroRecetaObtenerDiagnosticoAutomatico();

    const lista = await auroRecetaConsultarDiagnosticosAtencion(idAtencion, true);
    const estructurado = auroRecetaObtenerDiagnosticoEstructurado(lista, cie);

    if(estructurado){
      setVal('recCie10', estructurado.codigo);
      setVal('recDiagnostico', estructurado.texto);
      return estructurado.texto;
    }

    const fallback = auroRecetaObtenerDiagnosticoAutomatico();
    if(fallback) setVal('recDiagnostico', fallback);
    return fallback;
  }

  async function auroRecetaResolverDiagnosticoPorRecetaGuardada(receta){
    receta = receta || {};

    const actual = String(
      receta.diagnostico ||
      receta.motivo ||
      ''
    ).trim();

    const idAtencion = String(receta.id_atencion || '').trim();
    const cie = String(
      receta.diagnostico_cie10 ||
      receta.cie10 ||
      ''
    ).trim();

    if(!idAtencion){
      return actual && !auroRecetaDiagnosticoGenerico(actual) ? actual : '';
    }

    /*
      Siempre consulta la atención para adjuntar el conjunto completo.
      El diagnóstico principal ya guardado se conserva para compatibilidad;
      únicamente se completa si estaba vacío o era genérico.
    */
    const lista = await auroRecetaConsultarDiagnosticosAtencion(idAtencion, true);
    const diagnosticos = auroRecetaDiagnosticosNormalizados(lista);
    if(diagnosticos.length) receta.diagnosticos = diagnosticos;

    if(actual && !auroRecetaDiagnosticoGenerico(actual)){
      return actual;
    }

    const real = auroRecetaElegirDiagnosticoEstructurado(lista, cie);

    if(real){
      receta.diagnostico = real;

      /*
        Actualiza únicamente el respaldo local de esa misma receta.
        No cambia id_atencion, medicamentos, Plan ni Google Sheets.
      */
      const almacenadas = leerRecetasStorage();
      const indice = almacenadas.findIndex(x =>
        String(x.id_receta || '') === String(receta.id_receta || '')
      );

      if(indice >= 0){
        almacenadas[indice] = {
          ...almacenadas[indice],
          diagnostico: real
        };
        guardarRecetasStorage(almacenadas);
      }
    }

    return real || '';
  }

  function obtenerIdHistoriaActivaSeguro(idPaciente){
    const pacienteId = String(idPaciente || '').trim();

    try{
      const atencion = obtenerAtencionActivaSegura();
      const historiaAtencion = String(atencion?.id_historia || '').trim();
      const pacienteAtencion = String(atencion?.id_paciente || '').trim();

      if(
        historiaAtencion &&
        (!pacienteId || !pacienteAtencion || pacienteId === pacienteAtencion)
      ){
        return historiaAtencion;
      }

      const candidatos = [
        window.auroHistoriaSeleccionadaId,
        window.editingHistoryId,
        window.historiaActual?.id_historia,
        window.currentHistoria?.id_historia
      ];

      for(const valor of candidatos){
        const id = String(valor || '').trim();
        if(id) return id;
      }
    }catch(e){
      console.warn('No se pudo obtener id_historia activo.', e);
    }

    return '';
  }

  /* ============================================================
     IASYN RECETA 31 - CONTROL DE CORRECCIÓN CLÍNICA
     La atención abierta sigue editable. El servidor decide cuándo
     corresponde motivo, bloqueo o enmienda excepcional.
  ============================================================ */
  function auroRecetaTokenControlClinico(){
    /*
      IASYN: contrato propio primero. Se conserva AUROSANAX_SEGURIDAD y la
      clave histórica como compatibilidad interna mientras Seguridad/index
      terminan su migración coordinada. No representan una conexión externa.
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
    try{ return String(sessionStorage.getItem('iasyn_seguridad_token') || '').trim(); }catch(e){}
    try{ return String(sessionStorage.getItem('aurosanax_seguridad_token') || '').trim(); }catch(e){}
    return '';
  }

  if(typeof window.auroSolicitarMotivoCorreccionClinica !== 'function'){
    window.auroSolicitarMotivoCorreccionClinica = function(opciones){
      opciones = opciones || {};
      const excepcional = !!opciones.excepcional;
      const entrada = window.prompt(
        (excepcional ? 'ENMIENDA EXCEPCIONAL' : 'CORRECCIÓN CLÍNICA') +
        ' - JUSTIFICATIVO OBLIGATORIO\n\n' +
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
        motivo_correccion_tipo:tipo,
        motivo_correccion_detalle:detalle,
        motivo_correccion:detalle ? (tipo + ': ' + detalle) : tipo,
        correccion_excepcional:excepcional ? 'SI' : 'NO'
      };
    };
  }

  async function enviarRecetaGoogleSheets(receta){
    try{
      if(!receta) return { success:false, message:'No hay receta para enviar' };

      if(typeof API_URL === 'undefined' || !API_URL){
        return { success:false, message:'API_URL no está definida' };
      }

      const data = {
        id_receta: receta.id_receta || '',
        id_paciente: receta.id_paciente || '',
        id_historia: receta.id_historia || '',
        id_medico: receta.id_medico || obtenerIdMedicoReal() || '',
        fecha_receta: receta.fecha_receta || fechaHoyReceta(),
        diagnostico_cie10: receta.diagnostico_cie10 || '',
        diagnostico: receta.diagnostico || '',
        medicamento: receta.medicamento || '',
        presentacion: receta.presentacion || '',
        dosis: receta.dosis || '',
        via: receta.via || '',
        frecuencia: receta.frecuencia || '',
        duracion: receta.duracion || '',
        cantidad: receta.cantidad || '',
        indicaciones: recetaListaParaGuardarJSON(receta.indicaciones || ''),
        recomendaciones: recetaListaParaGuardarJSON(receta.recomendaciones || ''),
        id_documento: receta.id_documento || '',
        estado: receta.estado || 'Emitida',
        creado_en: receta.creado_en || fechaHoraEcuadorISO(),
        actualizado_en: fechaHoraEcuadorISO(),
        id_atencion: receta.id_atencion || obtenerIdAtencionActivaSeguro() || '',
        forzar_nueva_receta: receta.forzar_nueva_receta || 'NO',
        token: auroRecetaTokenControlClinico()
      };

      async function enviar(payload){
        const respuesta = await fetch(API_URL, {
          method:'POST',
          headers:{'Content-Type':'text/plain;charset=utf-8'},
          body:JSON.stringify({accion:'guardarReceta', data:payload})
        });
        if(!respuesta.ok) throw new Error('Error HTTP ' + respuesta.status);
        return await respuesta.json();
      }

      let resultado = await enviar(data);

      if(
        resultado && resultado.success === false &&
        ['AURO_MOTIVO_REQUERIDO','AURO_EXCEPCION_REQUERIDA'].includes(String(resultado.code || ''))
      ){
        const motivo = await window.auroSolicitarMotivoCorreccionClinica({
          excepcional: resultado.code === 'AURO_EXCEPCION_REQUERIDA' || resultado.requiere_excepcion === true
        });
        if(!motivo) return resultado;
        Object.assign(data, motivo);
        resultado = await enviar(data);
      }

      return resultado || {success:false,message:'Apps Script no devolvió respuesta.'};

    }catch(error){
      console.error('Error enviando receta a Google Sheets:', error);
      return { success:false, message:error.message || String(error) };
    }
  }


  function obtenerHistoriasPaciente(idPaciente){
    try{
      if(!Array.isArray(window.historiasClinicas)) return [];
      return window.historiasClinicas.filter(h => String(h.id_paciente || h.paciente_id || '') === String(idPaciente || ''));
    }catch(e){ return []; }
  }

  function obtenerUltimaHistoriaPaciente(idPaciente){
    const hs = obtenerHistoriasPaciente(idPaciente);
    if(!hs.length) return null;
    return hs.slice().sort((a,b) => {
      const fa = String(a.actualizado_en || a.fecha_atencion || a.fecha || '');
      const fb = String(b.actualizado_en || b.fecha_atencion || b.fecha || '');
      return fb.localeCompare(fa);
    })[0];
  }

  /* =====================================================
     IASYN RECETAS 3.6 - ALERGIAS DESDE HISTORIA CLÍNICA
     ---------------------------------------------------------
     Fuente prioritaria: historia clínica vinculada a la receta/atención.
     Respaldo: dato del paciente solo si la historia no contiene alergias.
     No persiste, duplica ni modifica antecedentes.
  ===================================================== */
  function auroRecetaHistoriaExactaParaAlergias(r){
    r = r || {};
    const idHistoria = String(
      r.id_historia ||
      r.historia?.id_historia ||
      r.paciente?.id_historia ||
      ''
    ).trim();
    const idPaciente = String(
      r.id_paciente ||
      r.paciente?.id_paciente ||
      r.paciente?.id ||
      ''
    ).trim();

    const objetos = [
      r.historia,
      window.historiaActual,
      window.currentHistoria
    ].filter(x => x && typeof x === 'object' && !Array.isArray(x));

    for(const h of objetos){
      const hId = String(h.id_historia || h.id || '').trim();
      const hPaciente = String(h.id_paciente || h.paciente_id || '').trim();
      if(
        (!idHistoria || !hId || hId === idHistoria) &&
        (!idPaciente || !hPaciente || hPaciente === idPaciente)
      ){
        const alergias = String(h.alergias || '').trim();
        if(alergias) return {historia:h, alergias};
      }
    }

    const listas = [
      window.historiasClinicas,
      window.historias,
      window.listaHistorias,
      window.historialHistorias
    ].filter(Array.isArray);

    for(const lista of listas){
      const h = lista.find(function(item){
        const hId = String(item?.id_historia || item?.id || '').trim();
        const hPaciente = String(item?.id_paciente || item?.paciente_id || '').trim();
        if(idHistoria) return hId === idHistoria;
        return !!(idPaciente && hPaciente === idPaciente);
      });

      if(h){
        const alergias = String(h.alergias || '').trim();
        if(alergias) return {historia:h, alergias};
      }
    }

    /*
      Para la atención actualmente abierta, hcAlergias ya representa el
      antecedente cargado/guardado por el módulo Antecedentes. Solo se usa
      si corresponde a la misma historia para no mezclar consultas.
    */
    const idHistoriaActiva = String(obtenerIdHistoriaActivaSeguro(idPaciente) || '').trim();
    if(!idHistoria || !idHistoriaActiva || idHistoria === idHistoriaActiva){
      const alergiasDOM = String(el('hcAlergias')?.value || '').trim();
      if(alergiasDOM) return {historia:null, alergias:alergiasDOM};
    }

    return {historia:null, alergias:''};
  }

  function auroRecetaAlergiasClinicasParaImpresion(r, pBase, pEncontrado){
    const desdeHistoria = auroRecetaHistoriaExactaParaAlergias(r);
    if(desdeHistoria.alergias) return desdeHistoria.alergias;

    return String(
      pBase?.alergias ||
      r?.paciente_alergias ||
      r?.alergias ||
      pEncontrado?.alergias ||
      ''
    ).trim();
  }

  function leerRecetasStorage(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    }catch(e){
      console.warn('No se pudo leer historial local de recetas.', e);
      return [];
    }
  }

  function guardarRecetasStorage(arr){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(arr) ? arr : [])); }
    catch(e){ console.warn('No se pudo guardar historial local de recetas.', e); }
  }

  function normalizarRecetaGuardada(r){
    r = r || {};
    return {
      id_receta: r.id_receta || r.id || '',
      id_paciente: r.id_paciente || r.paciente_id || '',
      id_historia: r.id_historia || '',
      id_atencion: r.id_atencion || '',
      id_medico: r.id_medico || obtenerIdMedicoReal(),
      codigo_medico: r.codigo_medico || obtenerCodigoCortoMedico(r.id_medico || obtenerIdMedicoReal()),
      paciente_nombre: r.paciente_nombre || r.paciente || r.nombre || '',
      paciente_cedula: r.paciente_cedula || r.cedula || r.numero_documento || '',
      paciente_telefono: r.paciente_telefono || r.telefono || r.whatsapp || '',
      fecha_receta: r.fecha_receta || r.fecha || fechaHoyReceta(),
      medico: r.medico || r.nombre_medico || obtenerNombreMedicoReal(),
      diagnostico_cie10: r.diagnostico_cie10 || r.cie10 || '',
      diagnostico: auroRecetaDiagnosticoGenerico(r.diagnostico || r.motivo || '')
        ? ''
        : (r.diagnostico || r.motivo || ''),
      medicamento: r.medicamento || r.medicamentos || '',
      presentacion: r.presentacion || '',
      dosis: r.dosis || '',
      via: r.via || '',
      frecuencia: r.frecuencia || '',
      duracion: r.duracion || '',
      cantidad: r.cantidad || '',
      indicaciones: recetaListaParaGuardarJSON(r.indicaciones || ''),
      recomendaciones: recetaListaParaGuardarJSON(r.recomendaciones || r.observaciones || ''),
      id_documento: r.id_documento || '',
      estado: r.estado || 'Emitida',
      creado_en: r.creado_en || '',
      actualizado_en: r.actualizado_en || ''
    };
  }

  function recetaTiempoSincronizacion(r){
    r = r || {};
    const valor = String(
      r.actualizado_en ||
      r.creado_en ||
      r.fecha_receta ||
      ''
    ).trim();

    if(!valor) return 0;

    const directo = Date.parse(valor);
    if(Number.isFinite(directo)) return directo;

    /*
      Respaldo para textos históricos tipo:
      yyyy-MM-dd HH:mm:ss / yyyy-MM-ddTHH:mm:ss
      Se comparan como una marca numérica estable, sin convertir zona horaria.
    */
    const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
    if(m){
      return Number(
        m[1] + m[2] + m[3] +
        m[4] + m[5] + (m[6] || '00')
      );
    }

    const soloFecha = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(soloFecha){
      return Number(soloFecha[1] + soloFecha[2] + soloFecha[3] + '000000');
    }

    return 0;
  }

  function mezclarRecetasLocalesYSheets(remotas){
    const mapa = new Map();

    /*
      FIX QUIRÚRGICO DE SINCRONIZACIÓN:
      - La versión más reciente gana por actualizado_en/creado_en.
      - Google Sheets ya no reemplaza automáticamente una copia local
        recién guardada con una respuesta remota todavía atrasada.
      - No cambia IDs, anti-duplicidad, guardado ni estructura de recetas.
    */
    leerRecetasStorage().forEach(item => {
      const r = normalizarRecetaGuardada(item);
      if(r.id_receta){
        mapa.set(String(r.id_receta), r);
      }
    });

    (Array.isArray(remotas) ? remotas : []).forEach(item => {
      const remota = normalizarRecetaGuardada(item);
      if(!remota.id_receta) return;

      const id = String(remota.id_receta);
      const local = mapa.get(id);

      if(!local){
        mapa.set(id, remota);
        return;
      }

      const tiempoLocal = recetaTiempoSincronizacion(local);
      const tiempoRemoto = recetaTiempoSincronizacion(remota);

      if(tiempoRemoto > tiempoLocal){
        mapa.set(id, Object.assign({}, local, remota));
      }else{
        mapa.set(id, Object.assign({}, remota, local));
      }
    });

    const mezcladas = Array.from(mapa.values()).sort((a,b) =>
      recetaTiempoSincronizacion(b) - recetaTiempoSincronizacion(a)
    );

    guardarRecetasStorage(mezcladas);
    return mezcladas;
  }

  async function cargarRecetasDesdeSheets(forzar){
    try{
      if(recetasSheetsCargando) return leerRecetasStorage();
      if(recetasSheetsCargadas && !forzar) return leerRecetasStorage();

      if(typeof API_URL === 'undefined' || !API_URL){
        return leerRecetasStorage();
      }

      recetasSheetsCargando = true;

      const res = await fetch(API_URL + '?accion=listarRecetas&_=' + Date.now());
      const data = await res.json();
      const remotas = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);

      const mezcladas = mezclarRecetasLocalesYSheets(remotas);
      recetasSheetsCargadas = true;
      recetasSheetsCargando = false;

      return mezcladas;

    }catch(error){
      recetasSheetsCargando = false;
      console.warn('No se pudieron cargar recetas desde Google Sheets.', error);
      return leerRecetasStorage();
    }
  }

  function mostrarMensajeReceta(texto, tipo){

    function pintarEstadoEn(contenedorId, insertador){
      let box = el(contenedorId);

      if(!box){
        box = document.createElement('div');
        box.id = contenedorId;
        box.className = 'auro-save-status';
        insertador(box);
      }

      box.className = 'auro-save-status ' + (tipo === 'ok' ? 'ok' : '');
      box.innerHTML = texto;
      box.style.display = 'block';
    }

    const seccionRecetas = el('recetas');
    if(seccionRecetas){
      pintarEstadoEn('recetaEstadoBox', function(box){
        const card = seccionRecetas.querySelector('.cardx');
        const row = seccionRecetas.querySelector('.row.g-3');
        if(card && row) card.insertBefore(box, row);
        else card?.prepend(box);
      });
    }
  }

  function marcarEstadoRecetaGuardadaVisual(esActualizacion){
    recetaEstadoVisual = esActualizacion ? 'actualizada' : 'guardada';
    recetaBloqueoPostGuardadoHasta = Date.now() + 2800;

    if(recetaEstadoTimer){
      clearTimeout(recetaEstadoTimer);
    }

    actualizarBotonGuardarReceta();

    recetaEstadoTimer = setTimeout(function(){
      recetaEstadoVisual = '';
      recetaBloqueoPostGuardadoHasta = 0;
      actualizarBotonGuardarReceta();
    }, 2800);
  }

  function auroRecetaPreparadaDesdePlan(){
    return !!(
      recetaPlanPerteneceAtencionActiva() &&
      recetaTieneMedicamentosReales(val('recMedicamento'))
    );
  }

  function auroRecetaPuedeGuardar(){
    const idAtencion = String(obtenerIdAtencionActivaSeguro() || '').trim();
    const existente = idAtencion ? buscarRecetaActivaPorAtencion(idAtencion) : null;

    /*
      IASYN RECETA 3.8 - EDICIÓN EXPLÍCITA DE RECETA EMITIDA
      Una receta ya existente nunca se corrige solo porque Plan tenga
      medicamentos cargados. Primero debe entrar explícitamente en edición.
      La primera receta conserva el flujo Plan → Receta original.
    */
    if(
      existente &&
      recetaModoTrabajo !== 'edicion' &&
      !recetaNuevaForzada
    ){
      return false;
    }

    return !!(
      recetaModoTrabajo === 'edicion' ||
      recetaModoTrabajo === 'nueva' ||
      auroRecetaPreparadaDesdePlan()
    );
  }

  function auroRecetaEntrarModoLectura(){
    recetaModoTrabajo = 'lectura';
    recetaNuevaForzada = false;
    recetaEditandoId = null;
    actualizarBotonGuardarReceta();
    auroRecetaActualizarCabeceraClinicaPremium();
  }

  function obtenerBotonesGuardarReceta(){
    const botones = [];

    function agregar(btn){
      if(btn && !botones.includes(btn)){
        botones.push(btn);
      }
    }

    agregar(el('btnGuardarRecetaERP'));

    document.querySelectorAll('[data-auro-receta-save-btn="1"]').forEach(agregar);
    document.querySelectorAll('[data-auro-receta-plan-btn="1"]').forEach(agregar);
    document.querySelectorAll('button[onclick*="guardarRecetaERP"], a[onclick*="guardarRecetaERP"]').forEach(agregar);

    document.querySelectorAll('button, a').forEach(btn => {
      const txt = String(btn.textContent || '').trim().toLowerCase();
      if(
        txt.includes('guardar receta') ||
        txt.includes('actualizar receta') ||
        txt.includes('guardando') ||
        txt.includes('receta guardada') ||
        txt.includes('receta actualizada')
      ){
        agregar(btn);
      }
    });

    return botones;
  }

  function actualizarBotonGuardarReceta(){
    const botones = obtenerBotonesGuardarReceta();
    const idAtencion = String(obtenerIdAtencionActivaSeguro() || '').trim();
    const existenteAtencion = idAtencion ? buscarRecetaActivaPorAtencion(idAtencion) : null;
    const idRecetaExistente = String(existenteAtencion?.id_receta || existenteAtencion?.id || '').trim();
    const editandoRecetaAtencion = !!(
      recetaModoTrabajo === 'edicion' &&
      recetaEditandoId &&
      idRecetaExistente &&
      String(recetaEditandoId).trim() === idRecetaExistente
    );

    botones.forEach((btn, i) => {
      if(!btn.id && i === 0){
        btn.id = 'btnGuardarRecetaERP';
      }

      btn.setAttribute('data-auro-receta-save-btn','1');
      const esBotonPlan = btn.getAttribute('data-auro-receta-plan-btn') === '1';

      if(recetaGuardando){
        btn.disabled = true;
        btn.setAttribute('aria-busy','true');
        btn.style.opacity = '0.65';
        btn.style.cursor = 'not-allowed';
        btn.style.pointerEvents = 'none';
        btn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i> Guardando receta...';
        return;
      }

      if(recetaEstadoVisual){
        btn.disabled = true;
        btn.removeAttribute('aria-busy');
        btn.style.opacity = '1';
        btn.style.cursor = 'not-allowed';
        btn.style.pointerEvents = 'none';
        btn.innerHTML = recetaEstadoVisual === 'actualizada'
          ? '<i class="bi bi-check-circle me-1"></i> Receta actualizada ✓'
          : '<i class="bi bi-check-circle me-1"></i> Receta guardada ✓';
        return;
      }

      /*
        Botón inteligente exclusivo del panel Plan:
        - receta emitida + lectura  -> Editar receta
        - receta emitida + edición  -> Guardar corrección
        El botón Guardar/Actualizar Plan clínico no participa aquí.
      */
      if(esBotonPlan && existenteAtencion && !editandoRecetaAtencion){
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.style.pointerEvents = '';
        btn.innerHTML = '<i class="bi bi-pencil-square me-1"></i> Editar receta';
        return;
      }

      if(esBotonPlan && editandoRecetaAtencion){
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.style.pointerEvents = '';
        btn.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Guardar corrección';
        return;
      }

      if(!auroRecetaPuedeGuardar()){
        btn.disabled = true;
        btn.removeAttribute('aria-busy');
        btn.style.opacity = '0.72';
        btn.style.cursor = 'not-allowed';
        btn.style.pointerEvents = 'none';
        btn.innerHTML = '<i class="bi bi-lock me-1"></i> Solo lectura';
        return;
      }

      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.style.pointerEvents = '';

      btn.innerHTML = recetaEditandoId
        ? '<i class="bi bi-save me-1"></i> Actualizar receta'
        : '<i class="bi bi-save me-1"></i> Guardar receta';
    });
  }

  function buscarRecetaActivaPorAtencion(idAtencion){
    const id = String(idAtencion || '').trim();
    if(!id) return null;

    return leerRecetasStorage()
      .filter(r =>
        String(r.id_atencion || '').trim() === id &&
        !String(r.estado || '').toLowerCase().includes('anulada')
      )
      .sort((a,b) =>
        String(b.actualizado_en || b.creado_en || b.fecha_receta || '')
          .localeCompare(String(a.actualizado_en || a.creado_en || a.fecha_receta || ''))
      )[0] || null;
  }

  /* =====================================================
     IASYN RECETAS 3.8 - BOTÓN INTELIGENTE DESDE PLAN
     ---------------------------------------------------------
     Un solo botón dentro de Plan:
     - Sin receta oficial: Guardar receta.
     - Con receta oficial: Editar receta.
     - En edición: Guardar corrección.

     La corrección conserva id_receta y usa guardarRecetaERP(), por lo que
     el backend mantiene el justificativo / enmienda y la auditoría clínica.
     No guarda ni modifica el Plan clínico.
  ===================================================== */
  window.auroRecetaAccionDesdePlan = async function(){
    verificarCambioAtencionReceta();

    const idAtencion = String(obtenerIdAtencionActivaSeguro() || '').trim();
    if(!idAtencion){
      alert('No existe una consulta activa. Abra o seleccione una atención antes de trabajar con la receta.');
      return {success:false, message:'Sin atención activa'};
    }

    if(recetaGuardando){
      actualizarBotonGuardarReceta();
      return {success:false, message:'Guardado en progreso'};
    }

    await cargarRecetasDesdeSheets(true);

    const existente = buscarRecetaActivaPorAtencion(idAtencion);
    const idExistente = String(existente?.id_receta || existente?.id || '').trim();
    const editandoMisma = !!(
      existente &&
      recetaModoTrabajo === 'edicion' &&
      recetaEditandoId &&
      String(recetaEditandoId).trim() === idExistente
    );

    /* Primera receta: conserva el flujo histórico Plan → Receta. */
    if(!existente){
      recetaEditandoId = null;
      recetaNuevaForzada = false;
      recetaModoTrabajo = 'nueva';
      recetaAtencionActualId = idAtencion;
      recetaPlanAtencionId = String(window.planState?.atencionActual || idAtencion || '').trim();

      if(typeof window.sincronizarPlanConReceta === 'function'){
        window.sincronizarPlanConReceta();
      }else if(typeof sincronizarPlanConReceta === 'function'){
        sincronizarPlanConReceta();
      }

      auroRecetaEditorRenderDesdeCampo(true);
      actualizarBotonGuardarReceta();
      auroRecetaActualizarCabeceraClinicaPremium();

      return await window.guardarRecetaERP();
    }

    /* Primer clic sobre una receta ya emitida: habilita corrección, no guarda. */
    if(!editandoMisma){
      await auroRecetaResolverDiagnosticoPorRecetaGuardada(existente);
      cargarRecetaEnFormulario(existente);

      /*
        Plan es únicamente la interfaz de trabajo visible. La receta conserva
        su id_receta oficial; los medicamentos visibles de la misma atención
        se sincronizan al campo canónico sin ejecutar guardado del Plan.
      */
      if(typeof window.sincronizarPlanConReceta === 'function'){
        window.sincronizarPlanConReceta();
      }else if(typeof sincronizarPlanConReceta === 'function'){
        sincronizarPlanConReceta();
      }

      recetaAtencionActualId = idAtencion;
      recetaPlanAtencionId = String(window.planState?.atencionActual || idAtencion || '').trim();
      auroRecetaEditorRenderDesdeCampo(true);
      actualizarBotonGuardarReceta();
      auroRecetaActualizarCabeceraClinicaPremium();

      if(typeof window.auroPlanActualizarMiniStatus === 'function'){
        window.auroPlanActualizarMiniStatus('Edición de receta habilitada · modifique y guarde la corrección');
      }

      return {success:true, modo:'edicion', id_receta:idExistente};
    }

    /* Segundo clic: guarda la corrección de la MISMA receta. */
    if(typeof window.sincronizarPlanConReceta === 'function'){
      window.sincronizarPlanConReceta();
    }else if(typeof sincronizarPlanConReceta === 'function'){
      sincronizarPlanConReceta();
    }

    auroRecetaEditorRenderDesdeCampo(true);
    const resultado = await window.guardarRecetaERP();

    if(resultado && resultado.success){
      auroRecetaEntrarModoLectura();
      auroRecetaEditorActualizarModo();
      auroRecetaActualizarCabeceraClinicaPremium();

      if(typeof window.auroPlanActualizarMiniStatus === 'function'){
        window.auroPlanActualizarMiniStatus('Corrección de receta registrada');
      }
    }

    return resultado;
  };

  /* =====================================================
     IASYN RECETAS 3.7 - PRIMERA RECETA DE LA ATENCIÓN
     ---------------------------------------------------------
     Si la atención activa ya fue verificada contra Sheets y no tiene
     ninguna receta emitida, habilita el editor como primera receta.
     No fuerza una segunda receta ni altera el control anti-duplicidad.
  ===================================================== */
  function auroRecetaSincronizarModoPrimeraReceta(){
    if(recetaEditandoId || recetaNuevaForzada) return false;

    const idAtencion = String(obtenerIdAtencionActivaSeguro() || '').trim();
    if(!idAtencion || !recetasSheetsCargadas) return false;

    const existente = buscarRecetaActivaPorAtencion(idAtencion);

    if(!existente){
      recetaModoTrabajo = 'nueva';
      recetaNuevaForzada = false;
    }else if(recetaModoTrabajo === 'nueva' && !recetaNuevaForzada){
      recetaModoTrabajo = 'lectura';
    }

    actualizarBotonGuardarReceta();
    auroRecetaEditorActualizarModo();
    auroRecetaActualizarCabeceraClinicaPremium();
    return !existente;
  }

  function limpiarFormularioReceta(){
    recetaEditandoId = null;
    recetaNuevaForzada = true;
    recetaModoTrabajo = 'nueva';
    auroRecetaMostrarPreview(false);
    recetaAtencionActualId = String(obtenerIdAtencionActivaSeguro() || '').trim();
    recetaPlanAtencionId = String(window.planState?.atencionActual || '').trim();
    recetaEstadoVisual = '';
    recetaBloqueoPostGuardadoHasta = 0;
    if(recetaEstadoTimer){ clearTimeout(recetaEstadoTimer); recetaEstadoTimer = null; }
    setVal('recFecha', fechaHoyReceta());
    sincronizarMedicoRecetaDesdeAtencion();
    setVal('recCie10', '');
    setVal('recEstado', 'Emitida');
    setVal('recDiagnostico', '');
    setVal('recMedicamento', '');
    setVal('recIndicaciones', '');
    setVal('recRecomendaciones', '');
    actualizarBotonGuardarReceta();
    auroRecetaActualizarCabeceraClinicaPremium();
    auroRecetaEditorRenderDesdeCampo(true);
    mostrarMensajeReceta('<i class="bi bi-plus-circle me-1"></i> Nueva receta habilitada. Puede escribir o cargar datos desde Plan.', '');
    vistaPreviaReceta();
  }

  function limpiarEstadoRecetaNuevaDespuesDeGuardar(){
    recetaEditandoId = null;
    recetaNuevaForzada = false;
    recetaModoTrabajo = 'lectura';
    recetaAtencionActualId = obtenerIdAtencionActivaSeguro() || '';

    setVal('recDiagnostico', '');
    setVal('recMedicamento', '');
    setVal('recIndicaciones', '');
    setVal('recRecomendaciones', '');

    actualizarBotonGuardarReceta();
    auroRecetaEditorRenderDesdeCampo(true);

    const box = el('recetaPreview');
    if(box){
      box.innerHTML = `<div class="text-muted text-center py-4">Receta guardada correctamente. Para una nueva atención, agregue medicamentos nuevos desde el Plan o presione <b>Nueva receta</b>.</div>`;
    }
  }

  function verificarCambioAtencionReceta(){
    const actual = String(obtenerIdAtencionActivaSeguro() || '').trim();

    if(recetaAtencionActualId && actual && recetaAtencionActualId !== actual){
      limpiarFormularioRecetaPorCambioAtencion();
    }

    recetaAtencionActualId = actual;
    recetaPlanAtencionId = String(window.planState?.atencionActual || '').trim();
  }

  window.obtenerDatosReceta = function(){
    const paciente = obtenerPacienteActivoSeguro();
    const idPaciente = String(paciente?.id_paciente || paciente?.id || '').trim();
    const idHistoriaActiva = obtenerIdHistoriaActivaSeguro(idPaciente);
    const ultimaHistoria = !idHistoriaActiva && paciente
      ? obtenerUltimaHistoriaPaciente(idPaciente)
      : null;

    return {
      id_receta: recetaEditandoId || '',
      id_paciente: idPaciente,
      id_historia: idHistoriaActiva || ultimaHistoria?.id_historia || ultimaHistoria?.id || '',
      id_atencion: obtenerIdAtencionActivaSeguro(),
      diagnosticos: auroRecetaDiagnosticosActualesSincronos(obtenerIdAtencionActivaSeguro()),
      paciente: paciente || {},
      fecha: val('recFecha') || fechaHoyReceta(),
      medico: obtenerNombreMedicoReal(),
      id_medico: obtenerIdMedicoReal(),
      codigo_medico: obtenerCodigoCortoMedico(),
      cie10: val('recCie10'),
      estado: val('recEstado') || 'Emitida',
      diagnostico: val('recDiagnostico'),
      medicamento: val('recMedicamento'),
      indicaciones: val('recIndicaciones'),
      recomendaciones: val('recRecomendaciones')
    };
  };

  function asegurarVistaPreviaReceta(){
    const seccion = el('recetas');
    if(!seccion) return null;

    let box = el('recetaPreview');
    if(box) return box;

    box = document.createElement('div');
    box.id = 'recetaPreview';
    box.className = 'cardx p-4 bg-white mt-4 auro-receta-preview-hidden';
    box.style.display = 'none';
    box.innerHTML = `<div class="text-muted text-center py-4">Vista previa pendiente. Complete los campos y presione <b>Vista previa</b> cuando desee revisarla.</div>`;

    const nota = seccion.querySelector('.clinical-note.mt-3');
    if(nota && nota.parentNode) nota.parentNode.insertBefore(box, nota.nextSibling);
    else seccion.querySelector('.cardx')?.appendChild(box);
    return box;
  }

  function auroRecetaActualizarBotonVistaPrevia(){
    const btn = el('btnVistaPreviaReceta');
    if(!btn) return;
    btn.setAttribute('aria-pressed', recetaPreviewVisible ? 'true' : 'false');
    btn.innerHTML = recetaPreviewVisible
      ? '<i class="bi bi-eye-slash"></i> Ocultar vista'
      : '<i class="bi bi-eye"></i> Vista previa';
  }

  function auroRecetaMostrarPreview(mostrar){
    recetaPreviewVisible = !!mostrar;
    const box = asegurarVistaPreviaReceta();
    if(box){
      box.classList.toggle('auro-receta-preview-hidden', !recetaPreviewVisible);
      box.style.display = recetaPreviewVisible ? '' : 'none';
    }
    auroRecetaActualizarBotonVistaPrevia();
    return recetaPreviewVisible;
  }

  function auroRecetaTogglePreview(){
    if(recetaPreviewVisible){
      auroRecetaMostrarPreview(false);
      return false;
    }

    auroRecetaMostrarPreview(true);
    window.vistaPreviaReceta();
    const box = el('recetaPreview');
    if(box){
      setTimeout(function(){
        try{ box.scrollIntoView({behavior:'smooth', block:'start'}); }catch(e){}
      }, 40);
    }
    return true;
  }

  function auroRecetaBuscarPacientePorReceta(r){
    try{
      const activo = obtenerPacienteActivoSeguro();
      const idRecetaPaciente = String(r?.id_paciente || r?.paciente?.id_paciente || r?.paciente?.id || '').trim();
      const cedulaReceta = String(r?.paciente_cedula || r?.cedula || r?.paciente?.cedula || '').replace(/\D/g,'');
      const nombreReceta = String(r?.paciente_nombre || r?.paciente?.nombre || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'')
        .replace(/\s+/g,' ');

      if(activo){
        const idActivo = String(activo.id_paciente || activo.id || '').trim();
        const cedulaActiva = String(activo.cedula || activo.numero_documento || activo.documento || '').replace(/\D/g,'');
        const nombreActivo = String(activo.nombre || ((activo.nombres || '') + ' ' + (activo.apellidos || '')))
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g,'')
          .replace(/\s+/g,' ');

        if(
          (idRecetaPaciente && idActivo && idRecetaPaciente === idActivo) ||
          (cedulaReceta && cedulaActiva && cedulaReceta === cedulaActiva) ||
          (nombreReceta && nombreActivo && nombreReceta === nombreActivo)
        ){
          return activo;
        }
      }

      if(Array.isArray(window.patients)){
        return window.patients.find(p => {
          const id = String(p.id_paciente || p.id || '').trim();
          const cedula = String(p.cedula || p.numero_documento || p.documento || '').replace(/\D/g,'');
          const nombre = String(p.nombre || ((p.nombres || '') + ' ' + (p.apellidos || '')))
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g,'')
            .replace(/\s+/g,' ');

          return (
            (idRecetaPaciente && id && idRecetaPaciente === id) ||
            (cedulaReceta && cedula && cedulaReceta === cedula) ||
            (nombreReceta && nombre && nombreReceta === nombre)
          );
        }) || null;
      }

      return null;
    }catch(e){
      return null;
    }
  }


  /* =====================================================
     IASYN RECETAS 3.4 - CÉDULA Y EDAD EN ENCABEZADO
     Intervención quirúrgica:
     - Calcula edad cumplida desde fecha_nacimiento si no viene informada.
     - Formatea la edad como "N años".
     - Amplía únicamente los alias de identificación del paciente.
     - No modifica diseño A4, medicamentos, Plan, guardado ni backend.
  ===================================================== */
  function auroRecetaCalcularEdadCumplida(fechaNacimiento){
    const raw = String(fechaNacimiento || '').trim();
    if(!raw) return '';

    let anio, mes, dia;

    let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m){
      anio = Number(m[1]);
      mes = Number(m[2]);
      dia = Number(m[3]);
    }else{
      m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if(!m) return '';
      dia = Number(m[1]);
      mes = Number(m[2]);
      anio = Number(m[3]);
    }

    if(!anio || !mes || !dia) return '';

    const hoyPartes = new Intl.DateTimeFormat('en-CA', {
      timeZone:'America/Guayaquil',
      year:'numeric',
      month:'2-digit',
      day:'2-digit'
    }).formatToParts(new Date()).reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

    const hoyAnio = Number(hoyPartes.year);
    const hoyMes = Number(hoyPartes.month);
    const hoyDia = Number(hoyPartes.day);

    let edad = hoyAnio - anio;
    if(hoyMes < mes || (hoyMes === mes && hoyDia < dia)) edad -= 1;

    return edad >= 0 && edad <= 130 ? String(edad) : '';
  }

  function auroRecetaFormatearEdad(valor, fechaNacimiento){
    let edad = String(valor ?? '').trim();

    if(!edad){
      edad = auroRecetaCalcularEdadCumplida(fechaNacimiento);
    }

    const numero = edad.match(/\d{1,3}/)?.[0] || '';
    if(!numero) return '—';

    return `${numero} años`;
  }

  function auroRecetaCompletarPacienteParaImpresion(r){
    const pBase = (r && r.paciente) ? r.paciente : {};
    const pEncontrado = auroRecetaBuscarPacientePorReceta(r) || {};

    const nombreCompletoEncontrado = pEncontrado.nombre || ((pEncontrado.nombres || '') + ' ' + (pEncontrado.apellidos || '')).trim();

    const p = Object.assign({}, pEncontrado, pBase);

    p.nombre = pBase.nombre || r?.paciente_nombre || nombreCompletoEncontrado || 'Paciente no seleccionado';
    p.cedula =
      pBase.cedula ||
      pBase.numero_documento ||
      pBase.documento ||
      pBase.identificacion ||
      pBase.numero_identificacion ||
      r?.paciente_cedula ||
      r?.cedula ||
      r?.numero_documento ||
      r?.identificacion ||
      pEncontrado.cedula ||
      pEncontrado.numero_documento ||
      pEncontrado.documento ||
      pEncontrado.identificacion ||
      pEncontrado.numero_identificacion ||
      '—';

    p.telefono = pBase.telefono || pBase.whatsapp || r?.paciente_telefono || pEncontrado.telefono || pEncontrado.whatsapp || '—';
    p.whatsapp = p.telefono;
    p.id_paciente = pBase.id_paciente || pBase.id || r?.id_paciente || pEncontrado.id_paciente || pEncontrado.id || '—';

    p.fecha_nacimiento =
      pBase.fecha_nacimiento ||
      pBase.fechaNacimiento ||
      pBase.nacimiento ||
      r?.paciente_fecha_nacimiento ||
      r?.fecha_nacimiento ||
      pEncontrado.fecha_nacimiento ||
      pEncontrado.fechaNacimiento ||
      pEncontrado.nacimiento ||
      '';

    p.sexo = String(
      pBase.sexo ||
      pBase.genero ||
      r?.paciente_sexo ||
      r?.paciente_genero ||
      r?.sexo ||
      r?.genero ||
      pEncontrado.sexo ||
      pEncontrado.genero ||
      ''
    ).trim();
    p.genero = p.sexo; // compatibilidad histórica interna; en la receta se presenta como Sexo.

    p.alergias = auroRecetaAlergiasClinicasParaImpresion(r, pBase, pEncontrado);

    p.edad = auroRecetaFormatearEdad(
      pBase.edad || r?.paciente_edad || pEncontrado.edad || '',
      p.fecha_nacimiento
    );

    return p;
  }

  function auroRecetaConfigInstitucional(){
    const candidatos = [
      window.iasynConfiguracionCentro,
      window.auroConfiguracionCentro,
      window.configuracionCentro,
      window.configCentro,
      window.CONFIG_CENTRO,
      window.configuracionInstitucional
    ];

    let cfg = candidatos.find(x => x && typeof x === 'object' && !Array.isArray(x)) || {};
    if(cfg.datos && typeof cfg.datos === 'object') cfg = cfg.datos;

    return {
      nombre: String(cfg.nombre_clinica || cfg.nombre_centro || cfg.nombre_comercial || cfg.razon_social || '').trim(),
      subtitulo: String(cfg.subtitulo_clinica || cfg.descripcion_clinica || cfg.eslogan_clinica || '').trim(),
      direccion: String(cfg.direccion_clinica || cfg.direccion || '').trim(),
      ciudad: String(cfg.ciudad_clinica || cfg.ciudad || '').trim(),
      provincia: String(cfg.provincia_clinica || cfg.provincia || '').trim(),
      pais: String(cfg.pais_clinica || cfg.pais || 'Ecuador').trim(),
      telefono: String(cfg.telefono_clinica || cfg.whatsapp_clinica || cfg.telefono || cfg.whatsapp || '').trim(),
      email: String(cfg.email_clinica || cfg.correo_clinica || cfg.email || cfg.correo || '').trim(),
      web: String(cfg.sitio_web_clinica || cfg.web_clinica || cfg.web || '').trim(),
      logo: String(cfg.logo_url || cfg.logo_drive_url || cfg.logo || '').trim(),
      mostrarLogo: String(cfg.mostrar_logo_receta ?? cfg.mostrar_logo ?? 'SI').trim().toUpperCase() !== 'NO'
    };
  }

  function auroRecetaMedicoEmisor(r){
    r = r || {};

    const idReceta = String(r.id_medico || '').trim();
    const idDetectado = String(obtenerIdMedicoReal() || '').trim();
    const idBuscado = idReceta || idDetectado;
    const nombreGuardado = String(r.medico || r.nombre_medico || val('recMedico') || '').trim();

    function normalizarNombreMedico(valor){
      return String(valor || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\b(dra|dr|doctora|doctor|medica|medico|especialista)\b\.?/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function idMedicoDe(m){
      return String(m?.id_medico || m?.id || m?.codigo || '').trim();
    }

    function nombreMedicoDe(m){
      return String(
        m?.nombre_completo ||
        m?.nombre ||
        ((m?.nombres || '') + ' ' + (m?.apellidos || ''))
      ).trim();
    }

    const listas = [];

    function agregarLista(lista){
      if(Array.isArray(lista) && !listas.includes(lista)) listas.push(lista);
    }

    agregarLista(recetaMedicosActivos);
    agregarLista(window.medicos);
    agregarLista(window.medicosActivos);
    agregarLista(window.listaMedicos);
    agregarLista(window.configuracionMedicos);
    agregarLista(window.medicosConfiguracion);

    try{ if(typeof medicos !== 'undefined') agregarLista(medicos); }catch(e){}
    try{ if(typeof medicosActivos !== 'undefined') agregarLista(medicosActivos); }catch(e){}
    try{ if(typeof listaMedicos !== 'undefined') agregarLista(listaMedicos); }catch(e){}

    const medicosDisponibles = [];
    const clavesVistas = new Set();

    listas.forEach(lista => {
      lista.forEach(m => {
        if(!m || typeof m !== 'object') return;
        const clave = idMedicoDe(m) || normalizarNombreMedico(nombreMedicoDe(m));
        if(!clave || clavesVistas.has(clave)) return;
        clavesVistas.add(clave);
        medicosDisponibles.push(m);
      });
    });

    let encontrado = null;

    /* 1. Búsqueda oficial y prioritaria por id_medico. */
    if(idBuscado){
      encontrado = medicosDisponibles.find(m => idMedicoDe(m) === idBuscado) || null;
    }

    /* 2. Si el ID falla, búsqueda tolerante por nombre almacenado. */
    if(!encontrado && nombreGuardado){
      const nombreBuscado = normalizarNombreMedico(nombreGuardado);

      if(nombreBuscado){
        encontrado = medicosDisponibles.find(m => {
          const nombreLista = normalizarNombreMedico(nombreMedicoDe(m));
          if(!nombreLista) return false;

          return (
            nombreLista === nombreBuscado ||
            nombreLista.includes(nombreBuscado) ||
            nombreBuscado.includes(nombreLista)
          );
        }) || null;
      }
    }

    const nombreEncontrado = nombreMedicoDe(encontrado);
    const idEncontrado = idMedicoDe(encontrado);

    return {
      id_medico: idEncontrado || idBuscado,
      nombre: nombreEncontrado || nombreGuardado || 'Profesional tratante',
      especialidad: String(
        encontrado?.especialidad_principal ||
        encontrado?.especialidad ||
        encontrado?.especialidad_medica ||
        ''
      ).trim(),
      registro_msp: String(
        encontrado?.registro_msp ||
        encontrado?.msp ||
        encontrado?.registro_profesional ||
        ''
      ).trim(),
      registro_senescyt: String(
        encontrado?.registro_senescyt ||
        encontrado?.senescyt ||
        ''
      ).trim(),
      telefono: String(encontrado?.telefono || encontrado?.whatsapp || '').trim(),
      email: String(encontrado?.email || encontrado?.correo || '').trim()
    };
  }

  function auroRecetaViaCompleta(via){
    const raw = String(via || '').trim();
    const key = raw.toUpperCase().replace(/[.\s_-]/g,'');
    const mapa = {
      VO:'Vía oral', ORAL:'Vía oral',
      IM:'Vía intramuscular', INTRAMUSCULAR:'Vía intramuscular',
      IV:'Vía intravenosa', INTRAVENOSA:'Vía intravenosa',
      SC:'Vía subcutánea', SUBCUTANEA:'Vía subcutánea', SUBCUTÁNEA:'Vía subcutánea',
      SL:'Vía sublingual', SUBLINGUAL:'Vía sublingual',
      TOPICA:'Vía tópica', TÓPICA:'Vía tópica',
      VAGINAL:'Vía vaginal', RECTAL:'Vía rectal',
      OFTALMICA:'Vía oftálmica', OFTÁLMICA:'Vía oftálmica',
      OTICA:'Vía ótica', ÓTICA:'Vía ótica',
      INHALATORIA:'Vía inhalatoria', NASAL:'Vía nasal'
    };
    return mapa[key] || raw;
  }

  /*
     IASYN RECETAS 2.5 - FASES 1 Y 2
     Tabla institucional compacta para vista previa/PDF.
     Intervención exclusivamente visual:
     - No cambia el JSON, el formulario, Plan, guardado ni Google Sheets.
     - Conserva compatibilidad con medicamentos estructurados y texto histórico.
  */
  function auroRecetaIndicacionesTabla(m){
    const partes = [
      m.via ? auroRecetaViaCompleta(m.via) : '',
      m.frec || '',
      m.dur ? 'durante ' + m.dur : '',
      m.ind || '',
      String(m.continuo || '').toLowerCase() === 'sí' ? 'Tratamiento continuo' : ''
    ].map(x => String(x || '').trim()).filter(Boolean);

    return [...new Set(partes)].join(' · ');
  }

  function auroRecetaMedicamentosPacienteHTML(valor){
    const txt = String(valor || '').trim();
    if(!txt){
      return '<div class="auro-empty-note">Sin medicamentos registrados.</div>';
    }

    let lista = recetaMedicamentosALista(txt);
    if(!lista.length){
      const respaldo = medicamentoRecetaJSONATexto(txt);
      lista = respaldo
        ? respaldo.split(/\n+/).map(x => ({texto:String(x || '').trim()})).filter(x => x.texto)
        : [];
    }

    if(!lista.length){
      return '<div class="auro-empty-note">Sin medicamentos registrados.</div>';
    }

    const filas = lista.map((item, index) => {
      let m;

      if(item && item.texto){
        const interpretado = recetaMedicamentoTextoAObjeto(item.texto);
        m = interpretado && !interpretado.texto
          ? normalizarMedicamentoRecetaObjeto(interpretado)
          : {
              med: String(item.texto || '').replace(/^\s*\d+\.\s*/, '').trim(),
              pres: '',
              cantidad: '',
              via: '',
              frec: '',
              dur: '',
              ind: '',
              continuo: 'No'
            };
      }else{
        m = normalizarMedicamentoRecetaObjeto(item || {});
      }

      const nombre = String(m.med || 'Medicamento').trim();
      const presentacion = String(m.pres || '').trim();
      const cantidad = String(m.cantidad || '').trim();
      const indicaciones = auroRecetaIndicacionesTabla(m);

      return `
        <tr>
          <td class="auro-rx-col-num">${index + 1}</td>
          <td class="auro-rx-col-med"><strong>${safe(nombre)}</strong></td>
          <td class="auro-rx-col-pres">${presentacion ? safe(presentacion) : '<span class="auro-rx-vacio">—</span>'}</td>
          <td class="auro-rx-col-cant">${cantidad ? safe(cantidad) : '<span class="auro-rx-vacio">—</span>'}</td>
          <td class="auro-rx-col-ind">${indicaciones ? safe(indicaciones) : '<span class="auro-rx-vacio">—</span>'}</td>
        </tr>`;
    }).join('');

    return `
      <div class="auro-rx-table-wrap">
        <table class="auro-rx-table" aria-label="Tratamiento prescrito">
          <colgroup>
            <col class="auro-rx-w-num">
            <col class="auro-rx-w-med">
            <col class="auro-rx-w-pres">
            <col class="auro-rx-w-cant">
            <col class="auro-rx-w-ind">
          </colgroup>
          <thead>
            <tr>
              <th scope="col">N.º</th>
              <th scope="col">Medicamento</th>
              <th scope="col">Presentación / concentración</th>
              <th scope="col">Cantidad</th>
              <th scope="col">Indicaciones</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;
  }

  /* =====================================================
     IASYN RECETAS 2.6 - CONTEXTO CLÍNICO DE LECTURA
     - Solo presentación y resolución de datos existentes.
     - No escribe ni corrige registros históricos en Google Sheets.
     - No modifica Guardar receta, edición, Plan ni PDF oficial.
  ===================================================== */
  function auroRecetaAtencionHistoricaPorId(idAtencion){
    idAtencion = String(idAtencion || '').trim();
    if(!idAtencion) return null;

    try{
      const actual = obtenerAtencionActivaSegura();
      if(actual && String(actual.id_atencion || actual.id || '').trim() === idAtencion){
        return actual;
      }
    }catch(e){}

    const listas = [
      window.atenciones,
      window.atencionesCache,
      window.listaAtenciones,
      window.historialAtenciones
    ].filter(Array.isArray);

    for(const lista of listas){
      const encontrada = lista.find(a => String(a?.id_atencion || a?.id || '').trim() === idAtencion);
      if(encontrada) return encontrada;
    }

    try{
      const raw = localStorage.getItem('aurosanax_atenciones_local_v1');
      const arr = raw ? JSON.parse(raw) : [];
      if(Array.isArray(arr)){
        return arr.find(a => String(a?.id_atencion || a?.id || '').trim() === idAtencion) || null;
      }
    }catch(e){}

    return null;
  }

  function auroRecetaPacienteHistoricoLectura(r){
    const base = auroRecetaCompletarPacienteParaImpresion(r || {});
    const nombreBase = String(base?.nombre || '').trim();

    if(nombreBase && nombreBase !== 'Paciente no seleccionado'){
      return base;
    }

    const atencion = auroRecetaAtencionHistoricaPorId(r?.id_atencion);
    const idPaciente = String(atencion?.id_paciente || atencion?.paciente_id || '').trim();

    if(idPaciente && Array.isArray(window.patients)){
      const p = window.patients.find(x => String(x?.id_paciente || x?.id || '').trim() === idPaciente);
      if(p){
        return auroRecetaCompletarPacienteParaImpresion({
          ...r,
          id_paciente:idPaciente,
          paciente:p
        });
      }
    }

    return base;
  }

  function auroRecetaNombreCortoPaciente(nombre){
    const limpio = String(nombre || '').replace(/\s+/g,' ').trim();
    if(!limpio || limpio === 'Paciente no seleccionado') return '—';
    const partes = limpio.split(' ').filter(Boolean);
    if(partes.length >= 4) return partes[0] + ' ' + partes[partes.length - 2];
    if(partes.length >= 2) return partes[0] + ' ' + partes[1];
    return partes[0] || '—';
  }

  function auroRecetaIdEspecialidadRegistroMedico(m){
    if(!m || typeof m !== 'object') return '';
    const especialidadObj = (m.especialidad && typeof m.especialidad === 'object')
      ? m.especialidad
      : null;

    return String(
      m.id_especialidad ||
      m.especialidad_id ||
      m.id_especialidad_principal ||
      especialidadObj?.id_especialidad ||
      especialidadObj?.id ||
      ''
    ).trim();
  }

  function auroRecetaEspecialidadRegistroMedico(m){
    const especialidadObj = (m?.especialidad && typeof m.especialidad === 'object')
      ? m.especialidad
      : null;

    return String(
      m?.especialidad_nombre ||
      m?.nombre_especialidad ||
      especialidadObj?.nombre_especialidad ||
      especialidadObj?.nombre ||
      (typeof m?.especialidad === 'string' ? m.especialidad : '') ||
      m?.especialidad_principal ||
      m?.area ||
      ''
    ).replace(/\s+/g,' ').trim();
  }

  function auroRecetaMedicoHistoricoLectura(r){
    r = r || {};
    const atencion = auroRecetaAtencionHistoricaPorId(r.id_atencion) || {};
    const idMedico = String(r.id_medico || atencion.id_medico || atencion.medico_id || '').trim();

    const listas = [
      recetaMedicosActivos,
      window.medicos,
      window.medicosActivos,
      window.listaMedicos,
      window.configuracionMedicos,
      window.medicosConfiguracion
    ].filter(Array.isArray);

    let registro = null;
    if(idMedico){
      for(const lista of listas){
        registro = lista.find(m => recetaIdMedicoRegistro(m) === idMedico) || null;
        if(registro) break;
      }
    }

    const nombre = String(
      r.medico ||
      r.nombre_medico ||
      recetaNombreMedicoRegistro(registro) ||
      atencion.nombre_medico ||
      atencion.medico ||
      ''
    ).replace(/\s+/g,' ').trim();

    const especialidad = String(
      r.especialidad ||
      r.especialidad_medico ||
      r.nombre_especialidad ||
      auroRecetaEspecialidadRegistroMedico(registro) ||
      atencion.especialidad_nombre ||
      atencion.nombre_especialidad ||
      atencion.especialidad ||
      ''
    ).replace(/\s+/g,' ').trim();

    const idEspecialidad = String(
      r.id_especialidad ||
      r.especialidad_id ||
      auroRecetaIdEspecialidadRegistroMedico(registro) ||
      atencion.id_especialidad ||
      atencion.especialidad_id ||
      ''
    ).trim();

    return {
      id_medico:idMedico,
      nombre:nombre || 'Profesional no identificado',
      id_especialidad:idEspecialidad,
      especialidad:especialidad || 'Especialidad no registrada'
    };
  }

  function auroRecetaNumeroConsultaLectura(r){
    const directa = String(r?.numero_consulta || '').trim();
    if(directa) return directa.replace(/^#/, '');
    const atencion = auroRecetaAtencionHistoricaPorId(r?.id_atencion);
    const n = String(atencion?.numero_consulta || '').trim();
    if(n) return n.replace(/^#/, '');
    const visual = consultaPorIdAtencion(r?.id_atencion || '');
    return String(visual || '').replace(/^#/, '').replace(/^—$/, '').trim();
  }

  function auroRecetaEnriquecerHistorial(r){
    const paciente = auroRecetaPacienteHistoricoLectura(r);
    const medico = auroRecetaMedicoHistoricoLectura(r);
    return Object.assign({}, r, {
      __paciente:paciente,
      __paciente_nombre:String(paciente?.nombre || r?.paciente_nombre || '').trim(),
      __paciente_cedula:String(paciente?.cedula || r?.paciente_cedula || '').trim(),
      __medico_nombre:medico.nombre,
      __medico_id:medico.id_medico,
      __especialidad_id:medico.id_especialidad,
      __especialidad:medico.especialidad,
      __consulta:auroRecetaNumeroConsultaLectura(r)
    });
  }

  function auroRecetaRegistroPertenecePacienteActivo(r){
    if(coincideConPacienteActivo(r)) return true;
    const activo = obtenerPacienteActivoSeguro();
    if(!activo) return false;

    const enriquecida = auroRecetaEnriquecerHistorial(r);
    const idActivo = String(activo.id_paciente || activo.id || '').trim();
    const idResuelto = String(enriquecida.__paciente?.id_paciente || enriquecida.__paciente?.id || '').trim();
    const cedulaActivo = String(activo.cedula || activo.numero_documento || activo.documento || '').replace(/\D/g,'');
    const cedulaResuelta = String(enriquecida.__paciente_cedula || '').replace(/\D/g,'');

    return !!(
      (idActivo && idResuelto && idActivo === idResuelto) ||
      (cedulaActivo && cedulaResuelta && cedulaActivo === cedulaResuelta)
    );
  }

  function auroRecetaModoActualTexto(){
    if(recetaModoTrabajo === 'edicion' && recetaEditandoId){
      return {texto:'Editando receta emitida', clase:'badge-warn'};
    }

    if(recetaModoTrabajo === 'nueva'){
      return {texto:'Nueva receta', clase:'badge-blue'};
    }

    if(auroRecetaPreparadaDesdePlan()){
      return {texto:'Preparada desde Plan', clase:'badge-blue'};
    }

    const idAtencion = String(obtenerIdAtencionActivaSeguro() || '').trim();
    const existente = idAtencion ? buscarRecetaActivaPorAtencion(idAtencion) : null;
    if(existente) return {texto:'Emitida · solo lectura', clase:'badge-ok'};

    return {texto:'Solo lectura', clase:'badge-auro'};
  }

  function auroRecetaActualizarCabeceraClinicaPremium(){
    const seccion = el('recetas');
    if(!seccion) return;

    const card = seccion.querySelector('.module-patient-card[data-module-patient="Recetas"]');
    const paciente = obtenerPacienteActivoSeguro();
    const atencion = obtenerAtencionActivaSegura() || {};
    const medico = obtenerMedicoDesdeAtencionActiva();
    const modo = auroRecetaModoActualTexto();
    auroRecetaEditorActualizarModo();

    if(card){
      card.classList.add('auro-receta-context-card');

      if(!paciente){
        card.classList.add('empty');
        card.innerHTML = '<div class="p-3"><b>Paciente activo</b><div class="small mt-1">Seleccione o abra un paciente antes de trabajar con la prescripción.</div></div>';
      }else{
        card.classList.remove('empty');
        const nombre = String(paciente.nombre || ((paciente.nombres || '') + ' ' + (paciente.apellidos || ''))).replace(/\s+/g,' ').trim() || 'Paciente';
        const cedula = String(paciente.cedula || paciente.numero_documento || paciente.documento || '—').trim() || '—';
        const edad = auroRecetaFormatearEdad(
          paciente.edad || '',
          paciente.fecha_nacimiento || paciente.fechaNacimiento || paciente.nacimiento || ''
        );
        const whatsapp = String(paciente.telefono || paciente.whatsapp || paciente.celular || 'No registrado').trim() || 'No registrado';
        const idPaciente = String(paciente.id_paciente || paciente.id || '—').trim() || '—';
        const consulta = String(atencion.numero_consulta || '').trim();
        const fechaAtencion = fechaVisual(atencion.fecha_atencion || atencion.fecha || atencion.fecha_consulta || '') || '—';
        const nombreMedico = medico.nombre || obtenerNombreMedicoReal() || 'Profesional tratante';
        const especialidad = auroRecetaEspecialidadRegistroMedico(medico.registro) || String(atencion.especialidad_nombre || atencion.nombre_especialidad || atencion.especialidad || '').trim() || 'Especialidad no registrada';
        const idAtencion = String(atencion.id_atencion || atencion.id || obtenerIdAtencionActivaSeguro() || '—').trim() || '—';

        card.innerHTML = `
          <div class="auro-receta-context-head">
            <div>
              <div class="auro-receta-context-kicker">Paciente activo</div>
              <div class="auro-receta-context-name">${safe(nombre)}</div>
            </div>
            <div class="auro-receta-context-actions">
              <button type="button" class="btn-action soft" onclick="if(typeof showScreen==='function') showScreen('historia')"><i class="bi bi-journal-medical me-1"></i> Ver historia</button>
              <button type="button" class="btn-action success" onclick="if(typeof abrirWhatsAppHistoria==='function') abrirWhatsAppHistoria()"><i class="bi bi-whatsapp me-1"></i> WhatsApp</button>
            </div>
          </div>
          <div class="auro-receta-context-grid">
            <div class="auro-receta-context-item"><small>Cédula / documento</small><b>${safe(cedula)}</b></div>
            <div class="auro-receta-context-item"><small>Edad</small><b>${safe(edad)}</b></div>
            <div class="auro-receta-context-item"><small>WhatsApp</small><b>${safe(whatsapp)}</b></div>
            <div class="auro-receta-context-item"><small>ID paciente</small><b>${safe(idPaciente)}</b></div>
            <div class="auro-receta-context-item auro-receta-consulta-item"><small>Consulta</small><b>${consulta ? 'N.º ' + safe(consulta) : '—'}</b></div>
            <div class="auro-receta-context-item"><small>Fecha de atención</small><b>${safe(fechaAtencion)}</b></div>
            <div class="auro-receta-context-item auro-receta-profesional-item" style="grid-column:span 2"><small>Especialidad / médico</small><span class="auro-receta-especialidad">${safe(especialidad)}</span><span class="auro-receta-medico">${safe(nombreMedico)}</span></div>
            <div class="auro-receta-context-item" style="grid-column:1/-1"><small>ID atención</small><b>${safe(idAtencion)}</b></div>
          </div>`;
      }
    }

    let modebar = el('auroRecetaModebar');
    const row = seccion.querySelector('.cardx > .row.g-3');
    if(!modebar && row){
      modebar = document.createElement('div');
      modebar.id = 'auroRecetaModebar';
      modebar.className = 'auro-receta-modebar';
      row.parentNode.insertBefore(modebar, row);
    }
    if(modebar){
      modebar.innerHTML = `<span><i class="bi bi-info-circle me-1"></i> Origen clínico: puede cargarse desde Plan. Los cambios realizados aquí afectan únicamente este documento y no modifican el Plan de la atención.</span><span class="badge-auro ${safe(modo.clase)}">${safe(modo.texto)}</span>`;
    }

    let formTitle = el('auroRecetaFormTitle');
    if(!formTitle && row){
      formTitle = document.createElement('div');
      formTitle.id = 'auroRecetaFormTitle';
      formTitle.className = 'auro-receta-form-title';
      row.parentNode.insertBefore(formTitle, row);
    }
    if(formTitle){
      formTitle.innerHTML = `<b>Tratamiento e indicaciones</b><small>Edición del documento asociado a la atención actual.</small>`;
    }
  }

  /*
     IASYN RECETAS 3.5 - CABECERA CLÍNICA PREMIUM
     Normaliza únicamente la representación visual de Sexo y alergias.
     No modifica ni persiste datos clínicos.
  */
  function auroRecetaSexoVisual(valor){
    const raw = String(valor || '').trim();
    const n = recetaNormalizarPlano(raw);
    if(!n) return '—';
    if(['f','femenino','femenina','mujer'].includes(n)) return 'Femenino';
    if(['m','masculino','masculina','hombre'].includes(n)) return 'Masculino';
    return raw;
  }

  function auroRecetaAlergiasVisual(valor){
    const raw = String(valor || '').trim();
    if(!raw) return 'No registrado';

    const n = recetaNormalizarPlano(raw);
    if(
      n.startsWith('refiere') ||
      n.startsWith('niega') ||
      n.startsWith('no refiere') ||
      n.startsWith('alergia confirmada') ||
      n.startsWith('alergias confirmadas') ||
      n.startsWith('no registrado') ||
      n.startsWith('no registrada')
    ){
      return raw;
    }

    const items = raw.split(';').map(x => String(x || '').trim()).filter(Boolean);
    if(items.length){
      const detalle = items.map(function(item){
        const partes = item.split('|').map(x => String(x || '').trim()).filter(Boolean);
        if(partes.length >= 2){
          return `${partes[0]} (${partes.slice(1).join(' · ')})`;
        }
        return item;
      }).join(' · ');

      return `Refiere alergias: ${detalle}`;
    }

    return `Refiere alergias: ${raw}`;
  }

  function construirHTMLReceta(r, modo){
    r = r || {};
    modo = modo === 'administrativo' ? 'administrativo' : 'paciente';
    const esAdministrativo = modo === 'administrativo';
    const p = auroRecetaCompletarPacienteParaImpresion(r);
    const cfg = auroRecetaConfigInstitucional();
    const medico = auroRecetaMedicoEmisor(r);

    const nombre = p.nombre || 'Paciente no seleccionado';
    const cedula = p.cedula || '—';
    const edad = p.edad || '—';
    const telefono = p.telefono || p.whatsapp || '—';
    const sexo = auroRecetaSexoVisual(p.sexo || p.genero || '');
    const alergias = auroRecetaAlergiasVisual(p.alergias || '');
    const idPaciente = p.id_paciente || p.id || '—';
    const idReceta = r.id_receta || '—';
    const idAtencion = r.id_atencion || '—';
    const idMedico = medico.id_medico || '—';
    const centro = cfg.nombre || 'IASYN';
    const estadoClass = String(r.estado).toLowerCase().includes('anulada') ? 'badge-danger' : 'badge-ok';
    const diagnosticosRepresentacion = auroRecetaDiagnosticosRepresentacionHTML(r);
    const diagnosticosPaciente = auroRecetaDiagnosticosListaImpresion(r);
    const diagnosticoCabeceraPaciente = auroRecetaDiagnosticoCabeceraPacienteHTML(r);
    const diagnosticoUnicoPaciente = !esAdministrativo
      ? auroRecetaDiagnosticoUnicoPacienteHTML(r)
      : '';
    const diagnosticosMultiplesPaciente = !esAdministrativo
      ? auroRecetaDiagnosticosMultiplesPacienteHTML(r)
      : '';
    const esMultidiagnosticoPaciente = !esAdministrativo && diagnosticosPaciente.length > 1;
    const ubicacion = [cfg.direccion, cfg.ciudad, cfg.provincia, cfg.pais].filter(Boolean).join(' · ');
    const contacto = [cfg.telefono, cfg.email, cfg.web].filter(Boolean).join(' · ');
    const registros = [
      medico.registro_msp ? `Registro MSP/ACESS: ${medico.registro_msp}` : '',
      medico.registro_senescyt ? `Registro SENESCYT: ${medico.registro_senescyt}` : ''
    ].filter(Boolean);
    const registroProfesional = medico.registro_msp || medico.registro_senescyt || '—';
    const especialidadProfesional = medico.especialidad || '—';
    const nombreProfesional = medico.nombre || 'Profesional tratante';

    const logo = cfg.mostrarLogo && cfg.logo
      ? `<img class="auro-receta-logo" src="${safe(cfg.logo)}" alt="Logo institucional" onerror="this.style.display='none';this.parentElement.classList.add('sin-logo');">`
      : '';

    const datosPaciente = esAdministrativo
      ? `
          <div><span>Paciente</span><b>${safe(nombre)}</b></div><div><span>Cédula</span><b>${safe(cedula)}</b></div>
          <div><span>Edad</span><b>${safe(edad)}</b></div><div><span>WhatsApp</span><b>${safe(telefono)}</b></div>
          <div><span>ID paciente</span><b>${safe(idPaciente)}</b></div><div><span>ID atención</span><b>${safe(idAtencion)}</b></div>
          <div><span>ID receta</span><b>${safe(idReceta)}</b></div><div><span>ID médico</span><b>${safe(idMedico)}</b></div>
          <div><span>CIE-10</span><b>${safe(r.cie10 || '—')}</b></div><div><span>Estado</span><b>${safe(r.estado || 'Emitida')}</b></div>
          <div style="grid-column:1/-1"><span>Diagnóstico</span>${diagnosticosRepresentacion}</div>`
      : `
          <div class="auro-rx-dato auro-rx-paciente"><span>Paciente</span><b>${safe(nombre)}</b></div>
          <div class="auro-rx-dato auro-rx-cedula"><span>Cédula</span><b>${safe(cedula)}</b></div>
          <div class="auro-rx-dato auro-rx-sexo"><span>Sexo</span><b>${safe(sexo)}</b></div>
          <div class="auro-rx-dato auro-rx-edad"><span>Edad</span><b>${safe(edad)}</b></div>
          <div class="auro-rx-dato auro-rx-fecha"><span>Fecha de emisión</span><b>${safe(fechaVisual(r.fecha))}</b></div>
          <div class="auro-rx-dato auro-rx-numero"><span>N.º de receta</span><b>${safe(idReceta === '—' ? '—' : idReceta)}</b></div>
          <div class="auro-rx-dato auro-rx-especialidad auro-rx-profesional"><span>Especialidad</span><b>${safe(especialidadProfesional)}</b></div>
          <div class="auro-rx-dato auro-rx-medico auro-rx-profesional"><span>Médico</span><b>${safe(nombreProfesional)}</b></div>
          <div class="auro-rx-dato auro-rx-registro auro-rx-profesional"><span>Registro profesional</span><b>${safe(registroProfesional)}</b></div>`;

    return `
      <div class="auro-receta-documento ${esAdministrativo ? 'modo-administrativo' : 'modo-paciente'} ${esMultidiagnosticoPaciente ? 'auro-receta-multi' : 'auro-receta-single'}">
        <style>
          .auro-receta-documento{font-family:Arial,system-ui,sans-serif;color:#111827;line-height:1.32;max-width:900px;margin:auto;background:#fff;font-size:12.5px;}
          .auro-receta-header{border-bottom:3px solid #8b1e5a;padding:0 0 11px;margin-bottom:10px;display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;}
          .auro-receta-logo-wrap{width:76px;height:76px;display:grid;place-items:center;border:1px solid #ead5e2;border-radius:16px;background:#fff;overflow:hidden}.auro-receta-logo-wrap:empty,.auro-receta-logo-wrap.sin-logo{display:none}.auro-receta-logo{max-width:100%;max-height:100%;object-fit:contain;display:block}
          .auro-receta-brand h2{margin:0;color:#8b1e5a;font-weight:950;letter-spacing:.04em;font-size:22px;line-height:1.05}.auro-receta-brand small{color:#6b7280;font-weight:750;font-size:11px;line-height:1.3;display:block;margin-top:3px}
          .auro-receta-title{text-align:right;color:#111827;min-width:180px}.auro-receta-title b{display:block;font-size:18px;letter-spacing:.04em}.auro-receta-title small{display:block;color:#6b7280;font-size:10.5px;margin-top:2px}
          .auro-receta-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;background:#fff7fb;border:1px solid #fbcfe8;border-radius:16px;padding:9px;margin-bottom:10px}.auro-receta-grid div{font-size:11.5px;border:1px solid #f1e4ec;background:#fff;border-radius:10px;padding:5px 7px;min-width:0}.auro-receta-grid span{display:block;color:#8b1e5a;font-weight:850;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:1px}.auro-receta-grid b{display:block;color:#111827;font-size:12px;line-height:1.2;overflow-wrap:anywhere;word-break:normal}
          .modo-paciente .auro-receta-grid{grid-template-columns:repeat(12,minmax(0,1fr));align-items:start;gap:0;background:#fff;border:0;border-bottom:1px solid #cbd5e1;border-radius:0;padding:0 0 6px;margin-bottom:6px}
          .modo-paciente .auro-receta-grid .auro-rx-dato{display:flex;flex-direction:column;justify-content:flex-start;min-height:36px;border:0;border-right:1px solid #e5e7eb;border-radius:0;background:#fff;padding:4px 7px;min-width:0}
          .modo-paciente .auro-receta-grid .auro-rx-paciente{grid-column:1/4}
          .modo-paciente .auro-receta-grid .auro-rx-cedula{grid-column:4/6}
          .modo-paciente .auro-receta-grid .auro-rx-sexo{grid-column:6/7}
          .modo-paciente .auro-receta-grid .auro-rx-edad{grid-column:7/8}
          .modo-paciente .auro-receta-grid .auro-rx-fecha{grid-column:8/10}
          .modo-paciente .auro-receta-grid .auro-rx-numero{grid-column:10/13;border-right:0}
          .modo-paciente .auro-receta-grid .auro-rx-especialidad{grid-column:1/5;border-top:1px solid #eef2f7;margin-top:2px;padding-top:6px}
          .modo-paciente .auro-receta-grid .auro-rx-medico{grid-column:5/9;border-top:1px solid #eef2f7;margin-top:2px;padding-top:6px}
          .modo-paciente .auro-receta-grid .auro-rx-registro{grid-column:9/13;border-top:1px solid #eef2f7;margin-top:2px;padding-top:6px;padding-left:12px;border-right:0}
          .modo-paciente .auro-receta-grid span{font-size:7.8px;line-height:1.05;margin-bottom:2px;letter-spacing:.025em}
          .modo-paciente .auro-receta-grid b{font-size:9.6px;line-height:1.22}
          .modo-paciente .auro-rx-paciente b,.modo-paciente .auro-rx-medico b,.modo-paciente .auro-rx-especialidad b{white-space:normal;overflow-wrap:anywhere;font-size:9.8px}
          .modo-paciente .auro-rx-cedula b,.modo-paciente .auro-rx-sexo b,.modo-paciente .auro-rx-edad b,.modo-paciente .auro-rx-fecha b,.modo-paciente .auro-rx-registro b{white-space:nowrap;overflow-wrap:normal;word-break:normal;font-size:9.2px!important}
          .modo-paciente .auro-rx-numero b{white-space:nowrap!important;overflow-wrap:normal!important;word-break:normal!important;font-size:8.8px!important;letter-spacing:-.035em}
          .auro-rx-alergias-linea{display:inline-grid;grid-template-columns:auto minmax(0,1fr);align-items:baseline;gap:8px;max-width:100%;width:fit-content;box-sizing:border-box;margin:0 0 7px;padding:5px 9px;border:1px solid #efd8e6;border-left:3px solid #8b1e5a;border-radius:8px;background:#fffafb}
          .auro-rx-alergias-linea span{color:#8b1e5a;font-size:7.8px;font-weight:900;text-transform:uppercase;letter-spacing:.025em;white-space:nowrap}
          .auro-rx-alergias-linea b{color:#1f2937;font-size:9.5px;line-height:1.25;font-weight:800;overflow-wrap:anywhere}
          .auro-rx-diagnosticos-lista{display:grid;gap:2px;margin-top:1px}
          .auro-rx-diagnostico-linea{display:block;padding:0!important;border:0!important;background:transparent!important;min-height:0!important}
          .auro-rx-diagnostico-linea b{font-size:10.5px!important;line-height:1.18!important;font-weight:800!important}
          .auro-rx-diagnostico-linea.principal b{font-weight:950!important}
          .auro-receta-section{margin-top:8px;break-inside:avoid}.auro-receta-section h4{margin:0 0 5px;color:#7a174f;font-size:12.5px;border-bottom:1px solid #f3d4e8;padding-bottom:4px;font-weight:950}.auro-receta-box{border:1px solid #e9d5e3;border-radius:12px;padding:8px 9px;white-space:normal;word-break:break-word;background:#fff;box-shadow:0 3px 12px rgba(139,30,90,.03)}
          .auro-rx-tratamiento-section .auro-receta-box{padding:0;border:0;border-radius:10px;box-shadow:none}
          .auro-rx-diagnostico-unico-section{width:fit-content;max-width:100%;margin-top:6px!important}.auro-rx-diagnostico-unico-section h4{margin-bottom:3px!important;font-size:10.8px!important;padding-bottom:3px!important}.auro-rx-diagnostico-unico{display:inline-flex;align-items:baseline;gap:6px;flex-wrap:wrap;max-width:100%;padding:4px 0;border-bottom:1px solid #e5e7eb}.auro-rx-diagnostico-unico strong{color:#8b1e5a;font-size:9.8px;font-weight:950}.auro-rx-diagnostico-unico-name{color:#1f2937;font-size:9px;font-weight:760;line-height:1.25;overflow-wrap:anywhere}
          .auro-rx-diagnosticos-section{margin-top:6px!important}.auro-rx-diagnosticos-section h4{margin-bottom:4px!important;font-size:10.8px!important;padding-bottom:3px!important}.auro-rx-diagnosticos-grid{display:grid;grid-template-columns:repeat(var(--auro-rx-dx-cols,3),minmax(0,1fr));gap:0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb}.auro-rx-diagnostico-card{min-width:0;border:0;border-right:1px solid #e5e7eb;border-radius:0;background:#fff;padding:5px 9px 5px 0;box-shadow:none}.auro-rx-diagnostico-card:last-child{border-right:0;padding-right:0}.auro-rx-diagnostico-card.principal{background:#fff}.auro-rx-diagnostico-card-head{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:3px}.auro-rx-diagnostico-card-head strong{color:#8b1e5a;font-size:9.8px;font-weight:950}.auro-rx-dx-jerarquia,.auro-rx-dx-tipo{display:inline-flex;align-items:center;padding:0;font-size:7.2px;font-weight:900;line-height:1.1;white-space:nowrap;background:transparent!important}.auro-rx-dx-jerarquia{color:#64748b}.auro-rx-diagnostico-card.principal .auro-rx-dx-jerarquia{color:#8b1e5a}.auro-rx-dx-tipo{color:#9a3412}.auro-rx-dx-tipo.definitivo{color:#166534}.auro-rx-diagnostico-card-name{color:#1f2937;font-size:8.8px;font-weight:750;line-height:1.25;overflow-wrap:anywhere}
          .auro-rx-table-wrap{width:100%;overflow-x:auto;border:1px solid #d9dde3;border-radius:10px;background:#fff}.auro-rx-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10.8px;line-height:1.25}.auro-rx-table th{background:#edf3f6;color:#263238;border-right:1px solid #cfd8dc;border-bottom:1px solid #bfc8cd;padding:6px 5px;text-align:center;font-size:9.2px;font-weight:950;text-transform:uppercase;letter-spacing:.025em}.auro-rx-table th:last-child{border-right:0}.auro-rx-table td{border-right:1px solid #dfe5e8;border-bottom:1px solid #dfe5e8;padding:6px 6px;vertical-align:top;overflow-wrap:anywhere;word-break:normal}.auro-rx-table tr:last-child td{border-bottom:0}.auro-rx-table td:last-child{border-right:0}.auro-rx-col-num{text-align:center;font-weight:900;color:#7a174f}.auro-rx-col-med strong{font-size:11.2px;color:#111827}.auro-rx-col-cant{text-align:center;font-weight:850}.auro-rx-col-ind{color:#334155}.auro-rx-vacio{color:#94a3b8}.auro-rx-w-num{width:5%}.auro-rx-w-med{width:20%}.auro-rx-w-pres{width:23%}.auro-rx-w-cant{width:10%}.auro-rx-w-ind{width:42%}
          .auro-text-premium{color:#1f2937;background:#f8fafc;border:1px solid #eef2f7;border-radius:12px;padding:7px 9px;font-size:12px;line-height:1.35}.auro-empty-note{color:#64748b;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;padding:7px 9px;font-size:12px}
          .auro-receta-footer{display:grid;grid-template-columns:1.2fr .8fr;gap:18px;margin-top:24px;align-items:end}.auro-centro-contacto{font-size:10.5px;color:#475569;line-height:1.45}.auro-firma{text-align:center;padding-top:20px;font-size:11px}.auro-linea{border-top:1px solid #111827;margin-bottom:5px}.badge-auro{display:inline-block;border-radius:999px;padding:4px 9px;font-size:10.5px;font-weight:900;margin-top:3px}.badge-ok{background:#dcfce7;color:#166534}.badge-danger{background:#fee2e2;color:#991b1b}
          .auro-admin-alert{border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;border-radius:12px;padding:7px 9px;margin-bottom:9px;font-weight:800;font-size:11px}
          @page{size:A4;margin:10mm}@media print{.no-print{display:none!important}.auro-receta-documento{max-width:none;font-size:11.4px;line-height:1.25}.auro-receta-header,.auro-receta-box,.auro-rx-table-wrap,.auro-rx-table tr,.auro-rx-diagnosticos-section,.auro-rx-diagnostico-unico-section,.auro-rx-alergias-linea{break-inside:avoid;page-break-inside:avoid}.auro-receta-grid{gap:4px;padding:6px}.auro-receta-grid div{padding:4px 6px}.modo-paciente .auro-receta-grid{gap:0!important;padding:0 0 5px!important}.modo-paciente .auro-receta-grid .auro-rx-dato{padding:3px 5px!important;min-height:32px!important}.modo-paciente .auro-receta-grid .auro-rx-especialidad,.modo-paciente .auro-receta-grid .auro-rx-medico,.modo-paciente .auro-receta-grid .auro-rx-registro{padding-top:5px!important}.modo-paciente .auro-receta-grid .auro-rx-registro{padding-left:10px!important}.modo-paciente .auro-receta-grid span{margin-bottom:2px!important}.modo-paciente .auro-receta-grid b{font-size:8.9px!important;line-height:1.2!important}.modo-paciente .auro-receta-grid .auro-rx-paciente b,.modo-paciente .auro-receta-grid .auro-rx-medico b,.modo-paciente .auro-receta-grid .auro-rx-especialidad b{font-size:9.05px!important}.modo-paciente .auro-receta-grid .auro-rx-cedula b,.modo-paciente .auro-receta-grid .auro-rx-sexo b,.modo-paciente .auro-receta-grid .auro-rx-edad b,.modo-paciente .auro-receta-grid .auro-rx-fecha b,.modo-paciente .auro-receta-grid .auro-rx-registro b{font-size:8.7px!important}.modo-paciente .auro-rx-numero b{font-size:8.15px!important}.auro-rx-alergias-linea{padding:4px 7px!important;margin-bottom:5px!important;gap:6px!important}.auro-rx-alergias-linea span{font-size:7.2px!important}.auro-rx-alergias-linea b{font-size:8.6px!important}.auro-rx-table{font-size:9.4px}.auro-rx-table th{font-size:8.3px;padding:4px}.auro-rx-table td{padding:4px 5px}.auro-rx-col-med strong{font-size:9.8px}.auro-rx-diagnostico-unico{padding:3px 0!important;gap:5px!important}.auro-rx-diagnostico-unico-name{font-size:8.2px!important}.auro-rx-diagnosticos-grid{gap:0}.auro-rx-diagnostico-card{padding:4px 6px 4px 0}.auro-rx-diagnostico-card-name{font-size:8px;line-height:1.22}.auro-receta-footer{margin-top:18px}.auro-admin-alert{display:none}}
          @media(max-width:700px){
            .auro-receta-header{grid-template-columns:auto 1fr}
            .auro-receta-title{grid-column:1/-1;text-align:left}
            .auro-receta-grid{grid-template-columns:1fr 1fr}
            .modo-paciente .auro-receta-grid{grid-template-columns:1fr 1fr!important}
            .modo-paciente .auro-receta-grid .auro-rx-dato{grid-column:auto!important;border-bottom:1px solid #eef2f7}
            .modo-paciente .auro-receta-grid .auro-rx-paciente,
            .modo-paciente .auro-receta-grid .auro-rx-numero,
            .modo-paciente .auro-receta-grid .auro-rx-especialidad,
            .modo-paciente .auro-receta-grid .auro-rx-medico,
            .modo-paciente .auro-receta-grid .auro-rx-registro{grid-column:1/-1!important;border-right:0}
            .modo-paciente .auro-receta-grid .auro-rx-registro{padding-left:7px}
            .auro-rx-alergias-linea{display:grid;grid-template-columns:1fr;width:100%;gap:2px}
            .auro-receta-footer{grid-template-columns:1fr}
            .auro-rx-diagnosticos-grid{grid-template-columns:1fr!important}
            .auro-rx-table-wrap{overflow-x:auto}
            .auro-rx-table{min-width:720px}
          }
        </style>
        ${esAdministrativo ? '<div class="auro-admin-alert">Vista administrativa interna: contiene identificadores y datos de auditoría. No entregar al paciente.</div>' : ''}
        <div class="auro-receta-header">
          <div class="auro-receta-logo-wrap">${logo}</div>
          <div class="auro-receta-brand"><h2>${safe(centro)}</h2>${cfg.subtitulo ? `<small>${safe(cfg.subtitulo)}</small>` : ''}${medico.especialidad ? `<small>${safe(medico.especialidad)}</small>` : ''}</div>
          <div class="auro-receta-title"><b>RECETA MÉDICA</b>${esAdministrativo ? `<span class="badge-auro ${estadoClass}">${safe(r.estado || 'Emitida')}</span>` : ''}</div>
        </div>
        <div class="auro-receta-grid">${datosPaciente}</div>
        ${!esAdministrativo ? `<div class="auro-rx-alergias-linea"><span>Antecedentes de alergias</span><b>${safe(alergias)}</b></div>` : ''}
        <div class="auro-receta-section auro-rx-tratamiento-section"><h4>Tratamiento prescrito</h4><div class="auro-receta-box">${auroRecetaMedicamentosPacienteHTML(r.medicamento)}</div></div>
        ${diagnosticoUnicoPaciente}
        ${diagnosticosMultiplesPaciente}
        ${esAdministrativo && r.indicaciones ? `<div class="auro-receta-section"><h4>Indicaciones para el paciente</h4><div class="auro-receta-box">${recetaBloqueTextoPremium(r.indicaciones, '—')}</div></div>` : ''}
        ${esAdministrativo && r.recomendaciones ? `<div class="auro-receta-section"><h4>Observaciones internas / recomendaciones</h4><div class="auro-receta-box">${recetaBloqueTextoPremium(r.recomendaciones, '—')}</div></div>` : ''}
        <div class="auro-receta-footer">
          <div class="auro-centro-contacto">${ubicacion ? `<div>${safe(ubicacion)}</div>` : ''}${contacto ? `<div>${safe(contacto)}</div>` : ''}${esAdministrativo ? `<div style="margin-top:5px;color:#64748b">ID receta: ${safe(idReceta)} · ID atención: ${safe(idAtencion)} · ID médico: ${safe(idMedico)}</div>` : ''}</div>
          <div class="auro-firma"><div class="auro-linea"></div><b>${safe(medico.nombre)}</b>${medico.especialidad ? `<br><span>${safe(medico.especialidad)}</span>` : ''}${registros.map(x=>`<br><span>${safe(x)}</span>`).join('')}<br><span>Firma y sello</span></div>
        </div>
      </div>`;
  }


  /*
     IASYN RECETAS 2.7 - ORIGINAL / COPIA A4 FINAL
     Intervención exclusivamente visual para la impresión del paciente.
     No modifica guardado, JSON, Plan, historial, Google Sheets,
     Apps Script, IDs, eventos ni sincronizaciones.
  */
  function construirHTMLRecetaPacienteDobleA4(r){
    const original = construirHTMLReceta(r, 'paciente');
    const copia = construirHTMLReceta(r, 'paciente');

    return `
      <div class="auro-hoja-a4-doble">
        <section class="auro-media-receta auro-media-original">
          <div class="auro-ejemplar-contenido">${original}</div>
          <div class="auro-ejemplar-etiqueta"><span>ORIGINAL</span></div>
        </section>

        <section class="auro-media-receta auro-media-copia">
          <div class="auro-ejemplar-contenido">${copia}</div>
          <div class="auro-ejemplar-etiqueta"><span>COPIA</span></div>
        </section>
      </div>

      <style>
        html,body{
          margin:0!important;
          padding:0!important;
          background:#fff!important;
        }

        body{
          width:100%;
          min-height:100%;
          overflow-x:hidden;
        }

        .auro-hoja-a4-doble{
          width:100%;
          max-width:194mm;
          margin:0 auto;
          background:#fff;
          box-sizing:border-box;
        }

        .auro-media-receta{
          position:relative;
          height:140mm;
          min-height:140mm;
          max-height:140mm;
          padding:2mm 0 8mm;
          overflow:hidden;
          box-sizing:border-box;
          background:#fff;
        }

        .auro-media-original{
          padding-top:2mm;
        }

        .auro-media-copia{
          border-top:1px dashed #8b8f97;
          margin-top:4mm;
          padding-top:4mm;
        }

        .auro-ejemplar-contenido{
          width:100%;
          height:100%;
          overflow:hidden;
        }

        .auro-media-receta .auro-receta-documento{
          width:100%!important;
          max-width:none!important;
          height:100%!important;
          min-height:0!important;
          margin:0!important;
          padding:0!important;
          box-sizing:border-box!important;
          display:flex!important;
          flex-direction:column!important;
          font-size:13px!important;
          line-height:1.10!important;
          overflow:hidden!important;
        }

        .auro-media-receta .auro-receta-header{
          grid-template-columns:auto 1fr auto!important;
          gap:8px!important;
          padding:0 0 5px!important;
          margin:0 0 5px!important;
          border-bottom-width:2px!important;
          flex:0 0 auto!important;
        }

        .auro-media-receta .auro-receta-logo-wrap{
          width:46px!important;
          height:46px!important;
          border-radius:9px!important;
        }

        .auro-media-receta .auro-receta-brand h2{
          font-size:19.3px!important;
          line-height:1.04!important;
        }

        .auro-media-receta .auro-receta-brand small{
          font-size:11.5px!important;
          line-height:1.10!important;
          margin-top:1px!important;
        }

        .auro-media-receta .auro-receta-title{
          min-width:125px!important;
        }

        .auro-media-receta .auro-receta-title b{
          font-size:17.1px!important;
          line-height:1.04!important;
        }

        .auro-media-receta .auro-receta-title small{
          font-size:11.4px!important;
          margin-top:2px!important;
        }

        .auro-media-receta .modo-paciente .auro-receta-grid{
          grid-template-columns:repeat(12,minmax(0,1fr))!important;
          gap:0!important;
          padding:0 0 4px!important;
          margin:0 0 4px!important;
          border:0!important;
          border-bottom:1px solid #cbd5e1!important;
          border-radius:0!important;
          background:#fff!important;
          flex:0 0 auto!important;
        }

        .auro-media-receta .modo-paciente .auro-receta-grid .auro-rx-dato{
          padding:2px 5px!important;
          min-height:28px!important;
          border:0!important;
          border-right:1px solid #e5e7eb!important;
          border-radius:0!important;
          background:#fff!important;
          font-size:9px!important;
        }

        .auro-media-receta .modo-paciente .auro-receta-grid .auro-rx-paciente{grid-column:1/4!important}
        .auro-media-receta .modo-paciente .auro-receta-grid .auro-rx-cedula{grid-column:4/6!important}
        .auro-media-receta .modo-paciente .auro-receta-grid .auro-rx-sexo{grid-column:6/7!important}
        .auro-media-receta .modo-paciente .auro-receta-grid .auro-rx-edad{grid-column:7/8!important}
        .auro-media-receta .modo-paciente .auro-receta-grid .auro-rx-fecha{grid-column:8/10!important}
        .auro-media-receta .modo-paciente .auro-receta-grid .auro-rx-numero{grid-column:10/13!important;border-right:0!important}
        .auro-media-receta .modo-paciente .auro-receta-grid .auro-rx-especialidad{grid-column:1/5!important;border-top:1px solid #eef2f7!important;margin-top:1px!important;padding-top:3px!important}
        .auro-media-receta .modo-paciente .auro-receta-grid .auro-rx-medico{grid-column:5/9!important;border-top:1px solid #eef2f7!important;margin-top:1px!important;padding-top:3px!important}
        .auro-media-receta .modo-paciente .auro-receta-grid .auro-rx-registro{grid-column:9/13!important;border-top:1px solid #eef2f7!important;margin-top:1px!important;padding-top:3px!important;padding-left:9px!important;border-right:0!important}

        .auro-media-receta .modo-paciente .auro-receta-grid span{
          font-size:7.2px!important;
          line-height:1.04!important;
          margin-bottom:2px!important;
          letter-spacing:.015em!important;
        }

        .auro-media-receta .modo-paciente .auro-receta-grid b{
          font-size:8.7px!important;
          line-height:1.12!important;
        }

        .auro-media-receta .modo-paciente .auro-receta-grid .auro-rx-numero b{
          font-size:7.9px!important;
          letter-spacing:-.035em!important;
        }

        .auro-media-receta .auro-rx-alergias-linea{
          margin:0 0 4px!important;
          padding:3px 6px!important;
          gap:5px!important;
          border-radius:6px!important;
          flex:0 0 auto!important;
        }

        .auro-media-receta .auro-rx-alergias-linea span{
          font-size:7px!important;
        }

        .auro-media-receta .auro-rx-alergias-linea b{
          font-size:8.3px!important;
          line-height:1.12!important;
        }

        .auro-media-receta .auro-receta-section{
          margin-top:4px!important;
          flex:0 0 auto!important;
        }

        .auro-media-receta .auro-receta-section h4{
          margin:0 0 3px!important;
          padding-bottom:2px!important;
          font-size:12.8px!important;
          line-height:1.10!important;
        }

        .auro-media-receta .auro-receta-box{
          padding:4px!important;
          border-radius:7px!important;
          box-shadow:none!important;
          overflow:hidden!important;
        }

        .auro-media-receta .auro-rx-tratamiento-section .auro-receta-box{
          padding:0!important;
          border:0!important;
          box-shadow:none!important;
        }

        .auro-media-receta .auro-rx-diagnostico-unico-section{
          width:fit-content!important;
          max-width:100%!important;
          margin-top:3px!important;
        }

        .auro-media-receta .auro-rx-diagnostico-unico{
          padding:2px 0!important;
          gap:4px!important;
        }

        .auro-media-receta .auro-rx-diagnostico-unico strong{
          font-size:8.7px!important;
        }

        .auro-media-receta .auro-rx-diagnostico-unico-name{
          font-size:7.9px!important;
          line-height:1.12!important;
        }

        .auro-media-receta .auro-rx-table-wrap{
          width:100%!important;
          overflow:hidden!important;
          border-radius:5px!important;
        }

        .auro-media-receta .auro-rx-table{
          width:100%!important;
          table-layout:fixed!important;
          font-size:10.6px!important;
          line-height:1.10!important;
        }

        .auro-media-receta .auro-rx-table th{
          font-size:9.4px!important;
          padding:2px 2px!important;
          line-height:1.08!important;
          letter-spacing:0!important;
        }

        .auro-media-receta .auro-rx-table td{
          padding:2px 3px!important;
          line-height:1.10!important;
          overflow-wrap:anywhere!important;
          word-break:normal!important;
        }

        .auro-media-receta .auro-rx-col-med strong{
          font-size:10.8px!important;
          line-height:1.10!important;
        }

        .auro-media-receta .auro-rx-w-num{width:5%!important}
        .auro-media-receta .auro-rx-w-med{width:21%!important}
        .auro-media-receta .auro-rx-w-pres{width:23%!important}
        .auro-media-receta .auro-rx-w-cant{width:9%!important}
        .auro-media-receta .auro-rx-w-ind{width:42%!important}

        .auro-media-receta .auro-receta-footer{
          margin-top:auto!important;
          padding-top:5px!important;
          gap:12px!important;
          grid-template-columns:1.1fr .9fr!important;
          align-items:start!important;
          flex:0 0 auto!important;
        }

        .auro-media-receta .auro-centro-contacto{
          font-size:10.4px!important;
          line-height:1.10!important;
          align-self:start!important;
        }

        .auro-media-receta .auro-firma{
          padding-top:0!important;
          font-size:10.8px!important;
          line-height:1.10!important;
          align-self:start!important;
        }

        .auro-media-receta .auro-linea{
          margin-bottom:3px!important;
        }

        .auro-ejemplar-etiqueta{
          position:absolute;
          left:0;
          right:0;
          bottom:0;
          height:6mm;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#4b5563;
          font-family:Arial,system-ui,sans-serif;
          font-size:11.3px;
          font-weight:900;
          letter-spacing:.08em;
        }

        .auro-ejemplar-etiqueta:before,
        .auro-ejemplar-etiqueta:after{
          content:"";
          flex:1;
          height:1px;
          background:#9ca3af;
        }

        .auro-ejemplar-etiqueta span{
          padding:0 9px;
          white-space:nowrap;
        }

        @page{
          size:A4 portrait;
          margin:6mm 8mm;
        }

        @media print{
          html,body{
            width:210mm!important;
            height:297mm!important;
            overflow:hidden!important;
            -webkit-print-color-adjust:exact!important;
            print-color-adjust:exact!important;
          }

          .auro-hoja-a4-doble{
            width:194mm!important;
            height:285mm!important;
            max-width:194mm!important;
            margin:0 auto!important;
            overflow:hidden!important;
            page-break-after:avoid!important;
            break-after:avoid-page!important;
          }

          html.auro-ios .auro-hoja-a4-doble{
            height:266mm!important;
          }

          html.auro-ios .auro-media-receta{
            height:131.5mm!important;
            min-height:131.5mm!important;
            max-height:131.5mm!important;
          }

          html.auro-ios .auro-media-copia{
            margin-top:3mm!important;
            padding-top:3mm!important;
          }

          .auro-media-receta{
            page-break-inside:avoid!important;
            break-inside:avoid!important;
          }
        }
      </style>`;
  }

  /*
     IASYN RECETAS 3.1 - DATOS ESTRUCTURADOS PARA REPRESENTACIÓN
     Corrige el flujo PDF llamado desde Plan/impresion.js.
     Cuando se trata de la receta activa aún no emitida, usa directamente
     medicamentosPlanSeleccionados como JSON estructurado.
     Las recetas ya guardadas conservan su propio contenido histórico.
  */
  function auroRecetaPrepararDatosParaRepresentacion(datos){
    const r = Object.assign({}, datos || {});
    const idReceta = String(r.id_receta || '').trim();

    /*
      Un PDF solicitado desde Plan llega por impresion.js como recetaOpcional,
      aunque todavía no sea una receta guardada. Por eso no se puede decidir
      únicamente con recetaOpcional: se distingue por ausencia de id_receta.
    */
    if(!idReceta && recetaPlanPerteneceAtencionActiva()){
      const medicamentosEstructurados = recetaMedicamentosPlanActualesSeguros();

      if(medicamentosEstructurados.length){
        r.medicamento = JSON.stringify(medicamentosEstructurados);
      }
    }

    return r;
  }

  window.vistaPreviaReceta = function(){
    verificarCambioAtencionReceta();
    sincronizarMedicoRecetaDesdeAtencion();
    if(el('recFecha') && !val('recFecha')) setVal('recFecha', fechaHoyReceta());
    if(!recetaEditandoId && recetaPlanPerteneceAtencionActiva() && typeof sincronizarPlanConReceta === 'function') sincronizarPlanConReceta();
    auroRecetaAutocompletarDiagnosticoSiVacio();
    auroRecetaNormalizarMedicamentosEdicionSiSeguro();
    const box = asegurarVistaPreviaReceta();
    const r = auroRecetaPrepararDatosParaRepresentacion(
      window.obtenerDatosReceta()
    );
    if(!r.paciente || !r.paciente.nombre){
      if(box) box.innerHTML = `<div class="sheet-note"><i class="bi bi-exclamation-triangle me-1"></i> Primero seleccione o abra un paciente desde Pacientes o Historia Clínica.</div>`;
      return r;
    }
    if(box) box.innerHTML = construirHTMLReceta(r, 'paciente');
    return r;
  };

  function auroGenerarPDFRecetaUnificada(recetaOpcional){
    if(!recetaOpcional){
      verificarCambioAtencionReceta();
      sincronizarMedicoRecetaDesdeAtencion();
    }
    if(el('recFecha') && !val('recFecha')) setVal('recFecha', fechaHoyReceta());
    if(!recetaOpcional && !recetaEditandoId && recetaPlanPerteneceAtencionActiva() && typeof sincronizarPlanConReceta === 'function') sincronizarPlanConReceta();
    if(!recetaOpcional){
      auroRecetaAutocompletarDiagnosticoSiVacio();
      auroRecetaNormalizarMedicamentosEdicionSiSeguro();
    }

    const r = auroRecetaPrepararDatosParaRepresentacion(
      recetaOpcional || window.obtenerDatosReceta()
    );

    if(!r.paciente || !r.paciente.nombre){
      alert('Seleccione primero un paciente para generar la receta.');
      if(typeof showScreen === 'function') showScreen('pacientes');
      return;
    }

    const html = construirHTMLRecetaPacienteDobleA4(r);
    const ventana = window.open('', '_blank');

    if(!ventana){
      alert('El navegador bloqueó la vista previa. Permita ventanas emergentes para este sitio.');
      return null;
    }

    /*
      Se conserva una sola referencia de la vista paciente oficial para
      permitir el comportamiento toggle desde la Historia clínica.
      No altera el contenido ni la impresión.
    */
    recetaVentanaPaciente = ventana;

    ventana.document.write(`<!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Vista previa de receta IASYN</title>
        <script>
          (function(){
            var esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            if(esIOS) document.documentElement.classList.add('auro-ios');
          })();
        <\/script>
        <style>
          html,body{
            margin:0;
            padding:0;
            background:#dfe3e8;
            font-family:Arial,system-ui,sans-serif;
          }

          .auro-preview-toolbar{
            position:sticky;
            top:0;
            z-index:9999;
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:12px;
            padding:12px 18px;
            background:#ffffff;
            border-bottom:1px solid #d1d5db;
            box-shadow:0 3px 14px rgba(15,23,42,.14);
          }

          .auro-preview-toolbar strong{
            color:#7a174f;
            font-size:15px;
          }

          .auro-preview-actions{
            display:flex;
            gap:8px;
            flex-wrap:wrap;
            align-items:center;
          }

          .auro-preview-zoom{
            display:flex;
            align-items:center;
            gap:6px;
            padding:4px 6px;
            border:1px solid #d1d5db;
            border-radius:10px;
            background:#f8fafc;
          }

          .auro-preview-zoom button{
            width:34px;
            height:34px;
            border:1px solid #cbd5e1;
            border-radius:8px;
            background:#ffffff;
            color:#374151;
            font-size:18px;
            font-weight:900;
            cursor:pointer;
          }

          .auro-preview-zoom button:hover{
            background:#fff7fb;
            color:#8b1e5a;
            border-color:#e7b8d2;
          }

          .auro-preview-zoom span{
            min-width:52px;
            text-align:center;
            color:#374151;
            font-size:12px;
            font-weight:900;
          }

          .auro-preview-fit{
            width:auto!important;
            padding:0 10px!important;
            font-size:12px!important;
          }

          .auro-preview-btn{
            border:0;
            border-radius:10px;
            padding:9px 14px;
            font-weight:850;
            cursor:pointer;
            background:#8b1e5a;
            color:#ffffff;
          }

          .auro-preview-btn.secondary{
            background:#ffffff;
            color:#374151;
            border:1px solid #cbd5e1;
          }

          .auro-preview-stage{
            min-height:calc(100vh - 62px);
            padding:20px;
            box-sizing:border-box;
            display:flex;
            justify-content:center;
            align-items:flex-start;
            overflow:auto;
          }

          .auro-preview-sheet{
            width:210mm;
            min-height:297mm;
            background:#ffffff;
            box-shadow:0 18px 42px rgba(15,23,42,.24);
            transform-origin:top center;
            transform:scale(1.15);
            margin-bottom:44mm;
          }

          .auro-preview-sheet .auro-hoja-a4-doble{
            width:194mm!important;
            max-width:194mm!important;
            margin:6mm 8mm!important;
          }

          @media(max-width:980px){
            .auro-preview-sheet{
              transform:scale(.82);
              margin-bottom:-53mm;
            }
          }

          @media(max-width:760px){
            .auro-preview-toolbar{
              align-items:stretch;
              flex-direction:column;
              gap:9px;
              padding:10px;
            }

            .auro-preview-actions{
              display:grid;
              grid-template-columns:1fr;
              width:100%;
              gap:7px;
            }

            .auro-preview-zoom{
              width:100%;
              justify-content:center;
              box-sizing:border-box;
            }

            .auro-preview-btn{
              width:100%;
              min-height:42px;
            }

            .auro-preview-stage{
              justify-content:center;
              padding:8px 4px 18px;
              overflow-x:hidden;
            }

            .auro-preview-sheet{
              transform-origin:top center;
              margin-left:auto;
              margin-right:auto;
            }
          }

          @media print{
            html,body{
              background:#ffffff!important;
            }

            .auro-preview-toolbar{
              display:none!important;
            }

            .auro-preview-stage{
              display:block!important;
              min-height:0!important;
              padding:0!important;
              overflow:visible!important;
            }

            .auro-preview-sheet{
              width:auto!important;
              min-height:0!important;
              margin:0!important;
              box-shadow:none!important;
              transform:none!important;
            }
          }
        </style>
      </head>
      <body>
        <div class="auro-preview-toolbar">
          <strong>Vista previa A4 vertical · Original y copia</strong>
          <div class="auro-preview-actions">
            <div class="auro-preview-zoom" aria-label="Controles de zoom">
              <button type="button" onclick="auroCambiarZoom(-10)" title="Disminuir zoom">−</button>
              <span id="auroZoomValor">115%</span>
              <button type="button" onclick="auroCambiarZoom(10)" title="Aumentar zoom">+</button>
              <button type="button" class="auro-preview-fit" onclick="auroAjustarZoom()" title="Ajustar a la ventana">Ajustar</button>
            </div>
            <button type="button" class="auro-preview-btn" onclick="window.print()">Imprimir / Guardar PDF</button>
            <button type="button" class="auro-preview-btn secondary" onclick="window.close()">Cerrar</button>
          </div>
        </div>

        <main class="auro-preview-stage">
          <div class="auro-preview-sheet" id="auroPreviewSheet">${html}</div>
        </main>

        <script>
          (function(){
            let auroZoomActual = 115;
            const auroZoomMinimo = 30;
            const auroZoomMaximo = 180;

            function auroAplicarZoom(){
              const hoja = document.getElementById('auroPreviewSheet');
              const etiqueta = document.getElementById('auroZoomValor');
              if(!hoja) return;

              hoja.style.transform = 'scale(' + (auroZoomActual / 100) + ')';

              const diferencia = auroZoomActual - 100;
              hoja.style.marginBottom = diferencia
                ? (diferencia * 2.97) + 'mm'
                : '0';

              if(etiqueta){
                etiqueta.textContent = auroZoomActual + '%';
              }
            }

            window.auroCambiarZoom = function(cambio){
              auroZoomActual = Math.max(
                auroZoomMinimo,
                Math.min(auroZoomMaximo, auroZoomActual + Number(cambio || 0))
              );
              auroAplicarZoom();
            };

            window.auroAjustarZoom = function(){
              const margenHorizontal = window.innerWidth <= 760 ? 12 : 44;
              const anchoDisponible = Math.max(240, window.innerWidth - margenHorizontal);
              const anchoHoja = 794;
              const calculado = Math.floor((anchoDisponible / anchoHoja) * 100);

              auroZoomActual = Math.max(
                auroZoomMinimo,
                Math.min(115, calculado)
              );

              auroAplicarZoom();
            };

            window.addEventListener('resize', function(){
              if(window.innerWidth <= 980){
                window.auroAjustarZoom();
              }
            });

            if(window.innerWidth <= 980){
              window.auroAjustarZoom();
            }else{
              auroAplicarZoom();
            }
          })();
        <\/script>
      </body>
      </html>`);

    ventana.document.close();
    ventana.focus();

    try{
      ventana.addEventListener('beforeunload', function(){
        setTimeout(function(){
          if(recetaVentanaPaciente === ventana){
            recetaVentanaPaciente = null;
            auroRecetaActualizarBotonesAccesoGlobal();
          }
        }, 80);
      });
    }catch(e){}

    auroRecetaActualizarBotonesAccesoGlobal();
    return ventana;
  }

  /*
     IASYN RECETAS 3.0 - MOTOR ÚNICO DE VISTA / IMPRESIÓN / PDF
     - Plan, Recetas e Historial usan la misma función interna.
     - La delegación segura apunta directamente al motor interno.
     - Evita recursión o sobrescritura por impresion.js.
     - No modifica botones, IDs, eventos, guardado, Plan ni sincronización.
  */
  function auroRecetaVistaPacienteAbierta(){
    try{
      return !!(recetaVentanaPaciente && !recetaVentanaPaciente.closed);
    }catch(e){
      return false;
    }
  }

  function auroRecetaActualizarBotonesAccesoGlobal(){
    const abierta = auroRecetaVistaPacienteAbierta();

    document.querySelectorAll('[data-auro-receta-global="1"]').forEach(function(btn){
      btn.setAttribute('aria-pressed', abierta ? 'true' : 'false');

      /*
        Solo cambia el texto del acceso global de Historia clínica.
        No modifica botones de Guardar receta ni las acciones del historial.
      */
      if(abierta){
        btn.innerHTML = '<i class="bi bi-eye-slash me-1"></i> Ocultar receta';
      }else{
        btn.innerHTML = '<i class="bi bi-capsule me-1"></i> Receta';
      }
    });
  }

  function auroRecetaCerrarVistaPaciente(){
    try{
      if(recetaVentanaPaciente && !recetaVentanaPaciente.closed){
        recetaVentanaPaciente.close();
      }
    }catch(e){}

    recetaVentanaPaciente = null;
    auroRecetaActualizarBotonesAccesoGlobal();
    return {abierta:false};
  }

  async function auroRecetaDatosOficialesAtencionActual(){
    verificarCambioAtencionReceta();
    await cargarMedicosActivosReceta(false);

    const idAtencion = String(obtenerIdAtencionActivaSeguro() || '').trim();

    /*
      Si existe receta emitida/guardada para la atención, esa es la fuente
      prioritaria, igual que al pulsar "Vista paciente / imprimir" en Acciones.
      Si aún no existe, se usa el formulario/Plan actual pero con LA MISMA
      plantilla A4 oficial.
    */
    if(idAtencion){
      await cargarRecetasDesdeSheets(true);
      const guardada = buscarRecetaActivaPorAtencion(idAtencion);

      if(guardada){
        await auroRecetaResolverDiagnosticoPorRecetaGuardada(guardada);
        return recetaGuardadaAFormatoPreview(guardada);
      }
    }

    sincronizarMedicoRecetaDesdeAtencion();
    auroRecetaAutocompletarDiagnosticoSiVacio();
    auroRecetaNormalizarMedicamentosEdicionSiSeguro();

    const datosActuales = auroRecetaPrepararDatosParaRepresentacion(
      window.obtenerDatosReceta()
    );
    await auroRecetaAdjuntarDiagnosticosAtencion(datosActuales, true);
    return datosActuales;
  }

  async function auroRecetaAbrirVistaPacienteOficial(){
    /*
      Abrir siempre usa el mismo motor visual de "Vista paciente / imprimir".
      Si ya existe una ventana oficial abierta, se enfoca en vez de duplicarla.
    */
    if(auroRecetaVistaPacienteAbierta()){
      try{ recetaVentanaPaciente.focus(); }catch(e){}
      auroRecetaActualizarBotonesAccesoGlobal();
      return recetaVentanaPaciente;
    }

    const datos = await auroRecetaDatosOficialesAtencionActual();

    if(!datos?.paciente || !datos.paciente.nombre){
      alert('Seleccione primero un paciente para generar la receta.');
      return null;
    }

    return auroGenerarPDFRecetaUnificada(datos);
  }

  async function auroRecetaToggleVistaPaciente(){
    if(auroRecetaVistaPacienteAbierta()){
      return auroRecetaCerrarVistaPaciente();
    }

    const ventana = await auroRecetaAbrirVistaPacienteOficial();
    return {abierta:!!ventana, ventana:ventana || null};
  }

  function auroInstalarMotorPDFRecetaUnificado(){
    /*
      impresion.js envía obtenerDatosReceta() como argumento. El motor vuelve
      a preparar esos datos para recuperar el arreglo estructurado del Plan
      antes de construir la tabla.
    */
    window.__auroRecetasConstruirPDFSeguro = function(datos){
      return auroGenerarPDFRecetaUnificada(
        auroRecetaPrepararDatosParaRepresentacion(datos)
      );
    };

    window.generarPDFReceta = auroGenerarPDFRecetaUnificada;
  }

  auroInstalarMotorPDFRecetaUnificado();

  function recetaDesdeFormulario(medicoAtencion){
    auroRecetaAutocompletarDiagnosticoSiVacio();
    auroRecetaNormalizarMedicamentosEdicionSiSeguro();
    const r = window.obtenerDatosReceta();
    const paciente = auroRecetaCompletarPacienteParaImpresion(r);
    return {
      id_receta: recetaEditandoId || crearIdReceta(medicoAtencion?.id_medico),
      id_paciente: r.id_paciente || paciente.id_paciente || paciente.id || '',
      id_historia: r.id_historia || '',
      id_atencion: r.id_atencion || obtenerIdAtencionActivaSeguro() || '',
      id_medico: r.id_medico || obtenerIdMedicoReal(),
      codigo_medico: r.codigo_medico || obtenerCodigoCortoMedico(r.id_medico || obtenerIdMedicoReal()),
      paciente_nombre: paciente.nombre || '',
      paciente_cedula: paciente.cedula || '',
      paciente_telefono: paciente.telefono || paciente.whatsapp || '',
      paciente_edad: paciente.edad || '',
      fecha_receta: r.fecha || fechaHoyReceta(), medico: medicoAtencion?.nombre || r.medico || obtenerNombreMedicoReal(), diagnostico_cie10: r.cie10 || '', diagnostico: r.diagnostico || '',
      medicamento: medicamentoRecetaParaGuardarJSON(r.medicamento), presentacion: '', dosis: '', via: '', frecuencia: '', duracion: '', cantidad: '',
      indicaciones: recetaListaParaGuardarJSON(r.indicaciones || ''),
      recomendaciones: recetaListaParaGuardarJSON(r.recomendaciones || ''),
      id_documento: '',
      estado: r.estado || 'Emitida',
      forzar_nueva_receta: recetaNuevaForzada ? 'SI' : 'NO',
      creado_en: '', actualizado_en: fechaHoraEcuadorISO()
    };
  }

  function cargarRecetaEnFormulario(receta){
    if(!receta) return;
    recetaNuevaForzada = false;
    recetaModoTrabajo = 'edicion';
    recetaEditandoId = receta.id_receta || receta.id || '';
    recetaAtencionActualId = receta.id_atencion || obtenerIdAtencionActivaSeguro() || '';
    setVal('recFecha', receta.fecha_receta || receta.fecha || fechaHoyReceta());
    setVal('recMedico', receta.medico || obtenerNombreMedicoReal());
    setVal('recCie10', receta.diagnostico_cie10 || receta.cie10 || '');
    setVal('recEstado', receta.estado || 'Emitida');
    setVal('recDiagnostico', receta.diagnostico || receta.motivo || '');
    setVal('recMedicamento', receta.medicamento || receta.medicamentos || '');
    setVal('recIndicaciones', recetaListaParaFormulario(receta.indicaciones || ''));
    setVal('recRecomendaciones', recetaListaParaFormulario(receta.recomendaciones || receta.observaciones || ''));
    if(!receta.id_atencion) receta.id_atencion = obtenerIdAtencionActivaSeguro();
    actualizarBotonGuardarReceta();
    auroRecetaActualizarCabeceraClinicaPremium();
    auroRecetaEditorRenderDesdeCampo(true);
    mostrarMensajeReceta('<i class="bi bi-pencil-square me-1"></i> Editando receta. Los cambios se aplican solo a Recetas y no modifican el Plan de la historia clínica.', '');
    vistaPreviaReceta();
  }

  window.guardarRecetaERP = async function(){
    if(!auroRecetaPuedeGuardar()){
      actualizarBotonGuardarReceta();
      mostrarMensajeReceta(
        '<i class="bi bi-lock me-1"></i> Esta receta está en modo lectura. Use <b>Editar receta</b> o <b>Nueva receta</b> antes de guardar.',
        ''
      );
      return;
    }

    if(recetaGuardando){
      mostrarMensajeReceta('<i class="bi bi-hourglass-split me-1"></i> La receta ya se está guardando. Espere unos segundos para evitar duplicados.', '');
      actualizarBotonGuardarReceta();
      return;
    }

    if(Date.now() < recetaBloqueoPostGuardadoHasta){
      mostrarMensajeReceta('<i class="bi bi-check-circle me-1"></i> La receta ya fue guardada. Espere unos segundos antes de volver a presionar.', 'ok');
      actualizarBotonGuardarReceta();
      return;
    }

    verificarCambioAtencionReceta();

    let estabaEditando = false;

    recetaGuardando = true;
    actualizarBotonGuardarReceta();

    try{
      await auroRecetaResolverDiagnosticoEstructurado();
      await cargarMedicosActivosReceta(false);

      const idAtencionGuardar = String(obtenerIdAtencionActivaSeguro() || '').trim();
      if(!idAtencionGuardar){
        alert('No existe una consulta activa. Abra o seleccione una atención antes de guardar la receta.');
        return;
      }

      /*
        CORRECCIÓN QUIRÚRGICA:
        - Si la atención ya tiene una receta activa, se reutiliza su id_receta.
        - Solo el botón “Nueva receta” permite crear otra receta intencional.
        - No modifica Plan, Atenciones, medicamentos, diagnóstico ni PDF.
      */
      if(!recetaEditandoId && !recetaNuevaForzada){
        await cargarRecetasDesdeSheets(true);
        const existenteAtencion = buscarRecetaActivaPorAtencion(idAtencionGuardar);
        if(existenteAtencion && existenteAtencion.id_receta){
          recetaEditandoId = String(existenteAtencion.id_receta);
        }
      }

      estabaEditando = !!recetaEditandoId;

      const atencionMedico = obtenerMedicoDesdeAtencionActiva();
      if(!atencionMedico.id_medico){
        alert('La atención activa no tiene un médico asignado. Abra nuevamente la consulta correcta antes de guardar la receta.');
        return;
      }

      const r = recetaDesdeFormulario(atencionMedico);

      if(!r.id_paciente || !r.paciente_nombre){
        alert('Seleccione primero un paciente para guardar la receta.');
        if(typeof showScreen === 'function') showScreen('pacientes');
        return;
      }

      if(!r.id_atencion){
        r.id_atencion = String(obtenerIdAtencionActivaSeguro() || '').trim();
      }

      if(!r.id_atencion){
        alert('No existe una consulta activa. Abra o seleccione una atención antes de guardar la receta.');
        return;
      }

      r.id_medico = atencionMedico.id_medico;
      r.codigo_medico = obtenerCodigoCortoMedico(atencionMedico.id_medico);
      r.medico = atencionMedico.nombre || obtenerNombreMedicoReal();
      if(atencionMedico.nombre) setVal('recMedico', atencionMedico.nombre);

      const idAtencionPlan = String(window.planState?.atencionActual || '').trim();
      if(idAtencionPlan && idAtencionPlan !== r.id_atencion){
        alert('El Plan cargado pertenece a otra consulta. Abra nuevamente la consulta correcta antes de guardar.');
        return;
      }

      if(recetaAtencionActualId && recetaAtencionActualId !== r.id_atencion){
        alert('La receta pertenece a un contexto de consulta anterior. Se bloqueó el guardado.');
        return;
      }

      if(!recetaTieneMedicamentosReales(r.medicamento)){
        alert('No hay medicamentos reales en la receta. Agregue al menos uno antes de guardar.');
        return;
      }

      if(!r.id_historia){
        r.id_historia = obtenerIdHistoriaActivaSeguro(r.id_paciente);
      }

      if(!r.diagnostico || auroRecetaDiagnosticoGenerico(r.diagnostico) || !r.diagnostico_cie10){
        r.diagnostico = await auroRecetaResolverDiagnosticoEstructurado();
        r.diagnostico_cie10 = val('recCie10');
      }

      if(!r.diagnostico || auroRecetaDiagnosticoGenerico(r.diagnostico)){
        alert('No se pudo identificar la descripción del diagnóstico de esta consulta. Actualice el diagnóstico estructurado antes de guardar la receta.');
        return;
      }

      if(!auroRecetaCodigoNormalizado(r.diagnostico_cie10)){
        alert('No se pudo identificar el código CIE-10 principal de esta consulta. Actualice el diagnóstico estructurado antes de guardar la receta.');
        return;
      }

      recetaAtencionActualId = r.id_atencion || recetaAtencionActualId || '';

      const lista = leerRecetasStorage();
      const listaAntesDeGuardar = JSON.parse(JSON.stringify(lista));
      const ahoraGuardado = fechaHoraEcuadorISO();
      let idx = lista.findIndex(x =>
        String(x.id_receta || '').trim() === String(r.id_receta || '').trim()
      );

      /*
        IASYN FIX QUIRÚRGICO - CREADO_EN / ACTUALIZADO_EN
        - Una receta NUEVA siempre recibe creado_en y actualizado_en nuevos.
        - Una ACTUALIZACIÓN conserva creado_en únicamente si coinciden
          id_receta e id_atencion con el registro realmente existente.
        - Nunca se hereda creado_en de otra receta, atención o consulta.
      */
      const registroExistente = idx >= 0 ? lista[idx] : null;
      const mismaReceta = !!(
        estabaEditando &&
        registroExistente &&
        String(registroExistente.id_receta || '').trim() === String(r.id_receta || '').trim() &&
        String(registroExistente.id_atencion || '').trim() === String(r.id_atencion || '').trim()
      );

      if(mismaReceta){
        r.creado_en = String(registroExistente.creado_en || '').trim() || ahoraGuardado;
        r.actualizado_en = ahoraGuardado;
        lista[idx] = {...registroExistente, ...r};
      }else{
        /* Cualquier inconsistencia de edición se trata como receta nueva segura. */
        if(!r.id_receta || idx >= 0 || estabaEditando){
          r.id_receta = crearIdReceta(atencionMedico.id_medico);
        }
        r.creado_en = ahoraGuardado;
        r.actualizado_en = ahoraGuardado;
        r.forzar_nueva_receta = 'SI';
        estabaEditando = false;
        lista.unshift(r);
      }

      guardarRecetasStorage(lista);
      recetasHistorialVisible = true;
      recetaAccionesAbiertaId = '';

      mostrarMensajeReceta('<i class="bi bi-hourglass-split me-1"></i> Guardando receta y enviando a Google Sheets...', '');

      const resultado = await enviarRecetaGoogleSheets(r);

      /*
        CONTROL DEFINITIVO:
        No se recarga inmediatamente desde Sheets. La respuesta JSON del backend
        ya confirmó el guardado o el bloqueo; se conserva la copia local únicamente
        cuando el servidor confirmó la escritura.
      */
      recetasPaginaActual = 1;
      renderHistorialRecetas();

      if(resultado && resultado.success){
        mostrarMensajeReceta(`<i class="bi bi-check-circle me-1"></i> Receta ${estabaEditando ? 'actualizada' : 'guardada'} correctamente. Ya fue asociada a la consulta activa.`, 'ok');
      }else{
        /* El backend es la autoridad. Si bloquea una corrección o falla el POST,
           se revierte únicamente la copia local recién escrita para no mostrar
           como guardado un cambio que no existe en Google Sheets. */
        guardarRecetasStorage(listaAntesDeGuardar);
        renderHistorialRecetas();
        const motivoError = resultado?.message || 'No se pudo guardar la receta en Google Sheets.';
        mostrarMensajeReceta(`<i class="bi bi-exclamation-triangle me-1"></i> ${safe(motivoError)}`, '');
        alert(motivoError);
        actualizarBotonGuardarReceta();
        return;
      }

      recetaNuevaForzada = false;

      if(!estabaEditando){
        limpiarEstadoRecetaNuevaDespuesDeGuardar();
      }else{
        recetaEditandoId = r.id_receta;
        vistaPreviaReceta();
      }

      if(resultado && resultado.success){
        marcarEstadoRecetaGuardadaVisual(estabaEditando);
      }else{
        actualizarBotonGuardarReceta();
      }

      return resultado;

    }catch(error){
      console.error('Error guardando receta:', error);
      mostrarMensajeReceta('<i class="bi bi-exclamation-triangle me-1"></i> Error al guardar receta. Intente nuevamente.', '');
      alert('Error al guardar receta: ' + (error && error.message ? error.message : error));
    }finally{
      recetaGuardando = false;
      actualizarBotonGuardarReceta();
    }
  };


  function consultaPorIdAtencion(idAtencion){
    try{
      if(!idAtencion) return '—';
      const raw = localStorage.getItem('aurosanax_atenciones_local_v1');
      const arr = raw ? JSON.parse(raw) : [];
      if(!Array.isArray(arr)) return '—';
      const a = arr.find(x => String(x.id_atencion || '') === String(idAtencion || ''));
      return a && a.numero_consulta ? '#' + a.numero_consulta : '—';
    }catch(e){
      return '—';
    }
  }

  function recortarTexto(valor, max){
    const txt = String(valor || '').replace(/\s+/g, ' ').trim();
    if(!txt) return '—';
    return txt.length > max ? txt.slice(0, max) + '...' : txt;
  }

  function toggleAccionesReceta(id){
    recetaAccionesAbiertaId = (String(recetaAccionesAbiertaId) === String(id)) ? '' : String(id);
    renderHistorialRecetas();
  }

  function auroRecetaClaveTextoFiltro(valor){
    return String(valor || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ')
      .trim();
  }

  function auroRecetaClaveMedicoFiltro(r){
    const id = String(r?.__medico_id || r?.id_medico || '').trim();
    if(id) return 'ID:' + id;
    const nombre = auroRecetaClaveTextoFiltro(r?.__medico_nombre || r?.medico || '');
    return nombre ? 'NOMBRE:' + nombre : '';
  }

  function auroRecetaClaveEspecialidadFiltro(r){
    const id = String(r?.__especialidad_id || r?.id_especialidad || r?.especialidad_id || '').trim();
    if(id) return 'ID:' + id;
    const nombre = auroRecetaClaveTextoFiltro(r?.__especialidad || r?.especialidad || '');
    return nombre ? 'NOMBRE:' + nombre : '';
  }

  function auroRecetaNumeroConsultaFiltro(valor){
    const txt = String(valor || '').trim();
    if(!txt) return '';
    const numero = txt.match(/\d+/)?.[0] || '';
    return numero || txt.replace(/^#/, '').trim();
  }

  function auroRecetaActualizarOpcionesFiltrosHistorial(recetasPaciente){
    const consultaInput = el('recHistorialConsulta');
    const consultaLista = el('recHistorialConsultaLista');
    const medicoSel = el('recHistorialMedico');
    const espSel = el('recHistorialEspecialidad');
    const recetas = Array.isArray(recetasPaciente) ? recetasPaciente : [];

    /* CONSULTA:
       datalist = sugerencias existentes;
       input = permite escribir manualmente N.º 20, 20, #20, etc. */
    if(consultaLista){
      const consultas = Array.from(new Set(
        recetas.map(r => String(r.__consulta || '').trim()).filter(Boolean)
      )).sort((a,b) => a.localeCompare(b, 'es', {numeric:true,sensitivity:'base'}));

      consultaLista.innerHTML = consultas
        .map(n => '<option value="N.º ' + safe(n) + '"></option>')
        .join('');
    }

    function cargarSelect(select, opciones, etiqueta){
      if(!select) return;
      const actual = String(select.value || '');
      const mapa = new Map();

      (opciones || []).forEach(op => {
        const value = String(op?.value || '').trim();
        const label = String(op?.label || '').replace(/\s+/g,' ').trim();
        if(!value || !label || mapa.has(value)) return;
        mapa.set(value, label);
      });

      const ordenadas = Array.from(mapa.entries())
        .map(([value,label]) => ({value,label}))
        .sort((a,b) => a.label.localeCompare(b.label, 'es', {numeric:true,sensitivity:'base'}));

      select.innerHTML = '<option value="">' + etiqueta + '</option>' +
        ordenadas.map(op =>
          '<option value="' + safe(op.value) + '">' + safe(op.label) + '</option>'
        ).join('');

      if(ordenadas.some(op => op.value === actual)){
        select.value = actual;
      }
    }

    /* MÉDICOS:
       prioridad por id_medico desde Configuración/listarMedicosActivos;
       recetas históricas aportan un fallback por nombre si falta ID. */
    const medicosConfig = Array.isArray(recetaMedicosActivos)
      ? recetaMedicosActivos.map(m => {
          const id = recetaIdMedicoRegistro(m);
          const nombre = recetaNombreMedicoRegistro(m);
          return {
            value: id ? 'ID:' + id : (nombre ? 'NOMBRE:' + auroRecetaClaveTextoFiltro(nombre) : ''),
            label: nombre
          };
        })
      : [];

    const medicosHistorial = recetas.map(r => ({
      value: auroRecetaClaveMedicoFiltro(r),
      label: r.__medico_nombre
    }));

    cargarSelect(
      medicoSel,
      medicosConfig.concat(medicosHistorial),
      'Todos los médicos'
    );

    /* ESPECIALIDADES:
       se resuelven desde el registro configurado del médico por ID.
       Si un registro histórico no tiene ID, se conserva fallback por nombre. */
    const especialidadesConfig = Array.isArray(recetaMedicosActivos)
      ? recetaMedicosActivos.map(m => {
          const id = auroRecetaIdEspecialidadRegistroMedico(m);
          const nombre = auroRecetaEspecialidadRegistroMedico(m);
          return {
            value: id ? 'ID:' + id : (nombre ? 'NOMBRE:' + auroRecetaClaveTextoFiltro(nombre) : ''),
            label: nombre
          };
        })
      : [];

    const especialidadesHistorial = recetas.map(r => ({
      value: auroRecetaClaveEspecialidadFiltro(r),
      label: r.__especialidad
    }));

    cargarSelect(
      espSel,
      especialidadesConfig.concat(especialidadesHistorial),
      'Todas las especialidades'
    );

    /* El valor escrito de consulta nunca se reemplaza al refrescar opciones. */
    if(consultaInput){
      consultaInput.value = String(consultaInput.value || '');
    }
  }

  function obtenerRecetasPacienteActivo(){
    const paciente = obtenerPacienteActivoSeguro();
    const q = val('recHistorialBuscar').toLowerCase().trim();
    const fecha = val('recHistorialFecha');
    const consultaFiltro = val('recHistorialConsulta');
    const medicoFiltro = val('recHistorialMedico');
    const especialidadFiltro = val('recHistorialEspecialidad');

    if(!paciente) return [];

    const recetasPaciente = leerRecetasStorage()
      .filter(r => auroRecetaRegistroPertenecePacienteActivo(r))
      .map(auroRecetaEnriquecerHistorial);

    auroRecetaActualizarOpcionesFiltrosHistorial(recetasPaciente);

    const consultaNumero = auroRecetaNumeroConsultaFiltro(consultaFiltro);

    return recetasPaciente
      .filter(r => !fecha || String(r.fecha_receta || '').slice(0,10) === fecha)
      .filter(r => !consultaNumero || String(r.__consulta || '').trim() === String(consultaNumero))
      .filter(r => !medicoFiltro || auroRecetaClaveMedicoFiltro(r) === medicoFiltro)
      .filter(r => !especialidadFiltro || auroRecetaClaveEspecialidadFiltro(r) === especialidadFiltro)
      .filter(r => !q || [
        r.diagnostico_cie10,
        r.diagnostico,
        r.id_receta,
        r.estado
      ].join(' ').toLowerCase().includes(q))
      .sort((a,b) => String(b.actualizado_en || b.creado_en || b.fecha_receta || '').localeCompare(String(a.actualizado_en || a.creado_en || a.fecha_receta || '')));
  }

  function asegurarHistorialRecetas(){
    const seccion = el('recetas'); if(!seccion) return null;
    let box = el('recetasHistorialBox'); if(box) return box;

    box = document.createElement('div');
    box.id = 'recetasHistorialBox';
    box.className = 'cardx p-4 bg-white mt-4';
    box.innerHTML = `
      <div class="section-head">
        <div>
          <h4 class="fw-bold mb-1">Historial de recetas</h4>
          <p class="text-muted mb-1">Paciente activo · filtre, revise, edite o reimprima una prescripción emitida.</p>
          <div class="small text-muted" id="recetasContador">Total recetas encontradas: 0</div>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          <button type="button" class="btn-soft" id="btnToggleRecetasHistorial"><i class="bi bi-eye-slash me-1"></i> Ocultar recetas</button>
          <button type="button" class="btn-soft" id="btnNuevaRecetaERP"><i class="bi bi-plus-circle me-1"></i> Nueva receta</button>
        </div>
      </div>

      <div id="recetasFiltrosBox" class="auro-receta-filtros-premium">
        <div class="auro-receta-filtro auro-receta-filtro-buscar">
          <label class="auro-receta-filter-label" for="recHistorialBuscar">Buscar</label>
          <input id="recHistorialBuscar" class="form-control" placeholder="Diagnóstico, CIE-10 o ID de receta">
        </div>
        <div class="auro-receta-filtro auro-receta-filtro-fecha">
          <label class="auro-receta-filter-label" for="recHistorialFecha">Fecha</label>
          <input id="recHistorialFecha" type="date" class="form-control">
        </div>
        <div class="auro-receta-filtro auro-receta-filtro-consulta">
          <label class="auro-receta-filter-label" for="recHistorialConsulta">Consulta</label>
          <input id="recHistorialConsulta" class="form-control" list="recHistorialConsultaLista" inputmode="numeric" autocomplete="off" placeholder="Todas / N.º 20">
          <datalist id="recHistorialConsultaLista"></datalist>
        </div>
        <div class="auro-receta-filtro auro-receta-filtro-medico">
          <label class="auro-receta-filter-label" for="recHistorialMedico">Médico</label>
          <select id="recHistorialMedico" class="form-select"><option value="">Todos los médicos</option></select>
        </div>
        <div class="auro-receta-filtro auro-receta-filtro-especialidad">
          <label class="auro-receta-filter-label" for="recHistorialEspecialidad">Especialidad</label>
          <select id="recHistorialEspecialidad" class="form-select"><option value="">Todas las especialidades</option></select>
        </div>
        <div class="auro-receta-filtro auro-receta-filtro-limpiar">
          <button type="button" class="btn-soft" id="btnLimpiarFiltroRecetas" title="Limpiar filtros" aria-label="Limpiar filtros"><i class="bi bi-arrow-counterclockwise"></i></button>
        </div>
      </div>

      <style>
        #recetasFiltrosBox.auro-receta-filtros-premium{
          display:flex;
          flex-wrap:wrap;
          gap:10px;
          align-items:flex-end;
          padding:13px;
          margin:0 0 16px;
          border:1px solid #eee4ea;
          border-radius:17px;
          background:linear-gradient(135deg,#ffffff,#fffafd);
          box-shadow:0 7px 20px rgba(15,23,42,.035);
        }
        #recetasFiltrosBox .auro-receta-filtro{
          min-width:0;
        }
        #recetasFiltrosBox .auro-receta-filtro-buscar{flex:2 1 280px;}
        #recetasFiltrosBox .auro-receta-filtro-fecha{flex:1 1 165px;}
        #recetasFiltrosBox .auro-receta-filtro-consulta{flex:1 1 190px;}
        #recetasFiltrosBox .auro-receta-filtro-medico{flex:1.65 1 260px;}
        #recetasFiltrosBox .auro-receta-filtro-especialidad{flex:1.65 1 260px;}
        #recetasFiltrosBox .auro-receta-filtro-limpiar{
          flex:0 0 48px;
          display:flex;
          align-items:flex-end;
        }
        #recetasFiltrosBox .form-control,
        #recetasFiltrosBox .form-select{
          width:100%;
          min-height:44px;
          border-radius:13px!important;
          font-size:13px!important;
          color:#111827!important;
          background-color:#fff!important;
          text-overflow:ellipsis;
        }
        #recetasFiltrosBox .auro-receta-filtro-medico .form-select,
        #recetasFiltrosBox .auro-receta-filtro-especialidad .form-select{
          min-width:220px;
        }
        #recetasFiltrosBox #btnLimpiarFiltroRecetas{
          width:48px;
          height:44px;
          min-height:44px;
          padding:0!important;
          border-radius:13px!important;
          display:grid;
          place-items:center;
        }

        #recetasHistorialBox .receta-acciones-row td{
          padding:4px 8px 10px!important;
          border-bottom:0!important;
        }
        #recetasHistorialBox .auro-receta-actions-panel{
          display:flex;
          align-items:center;
          gap:10px;
          flex-wrap:wrap;
          padding:10px 12px;
          border:1px solid #ead5e2;
          border-left:4px solid #8b1e5a;
          border-radius:14px;
          background:linear-gradient(135deg,#ffffff,#fffafd);
          box-shadow:0 7px 18px rgba(15,23,42,.045);
        }
        #recetasHistorialBox .auro-receta-actions-title{
          color:#7a174f;
          font-size:12px;
          font-weight:900;
          white-space:nowrap;
          margin-right:2px;
        }
        #recetasHistorialBox .auro-receta-actions-buttons{
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
        }
        #recetasHistorialBox .auro-receta-actions-buttons .btn-action{
          min-height:38px;
          padding:7px 11px;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          gap:6px;
          border-radius:11px;
          white-space:nowrap;
        }
        #recetasHistorialBox .auro-receta-actions-buttons .btn-action i{
          margin:0!important;
        }
        #recetasHistorialBox .auro-receta-actions-trigger{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          gap:6px;
          min-height:36px;
          padding:7px 10px;
          white-space:nowrap;
        }
        @media (max-width: 1100px){
          #recetasFiltrosBox .auro-receta-filtro-buscar{flex:2 1 320px;}
          #recetasFiltrosBox .auro-receta-filtro-fecha{flex:1 1 190px;}
          #recetasFiltrosBox .auro-receta-filtro-consulta{flex:1 1 190px;}
          #recetasFiltrosBox .auro-receta-filtro-medico{flex:1 1 320px;}
          #recetasFiltrosBox .auro-receta-filtro-especialidad{flex:1 1 320px;}
        }
        @media (max-width: 768px){
          #recetasHistorialBox{padding:14px!important;}
          #recetasHistorialBox .table-responsive{display:none!important;}
          #recetasHistorialMobile{display:block!important;}
          #recetasHistorialBox .section-head{display:grid!important;grid-template-columns:1fr auto;gap:10px;align-items:start;}
          #recetasHistorialBox .section-head h4{font-size:20px!important;line-height:1.08;}
          #recetasHistorialBox .section-head .d-flex{display:grid!important;grid-template-columns:1fr;gap:8px;}
          #recetasHistorialBox .section-head button{min-width:130px;white-space:normal;}
          #recetasFiltrosBox{padding:10px!important;gap:8px!important;}
          #recetasFiltrosBox > div{width:100%!important;flex:1 1 100%!important;}
          #recetasFiltrosBox .auro-receta-filtro-medico .form-select,
          #recetasFiltrosBox .auro-receta-filtro-especialidad .form-select{min-width:0!important;}
          #recetasFiltrosBox .auro-receta-filtro-limpiar{align-items:stretch!important;}
          #recetasFiltrosBox #btnLimpiarFiltroRecetas{width:100%!important;}
          #recetasHistorialBox .auro-receta-actions-panel{display:block;padding:10px;}
          #recetasHistorialBox .auro-receta-actions-title{display:block;margin-bottom:8px;}
          #recetasHistorialBox .auro-receta-actions-buttons{display:grid;grid-template-columns:1fr;gap:7px;}
          #recetasHistorialBox .auro-receta-actions-buttons .btn-action{width:100%;}
          .auro-receta-mobile-card{border:1px solid #e5e7eb;border-radius:16px;padding:12px;margin-bottom:10px;background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.06);}
          .auro-receta-mobile-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:8px;}
          .auro-receta-mobile-head b{font-size:14px;}
          .auro-receta-mobile-card .small{font-size:12px;line-height:1.35;}
          .auro-receta-mobile-card .btn-action{width:100%;margin-top:8px;}
        }
        @media (min-width: 769px){
          #recetasHistorialMobile{display:none!important;}
        }
      </style>

      <div id="recetasHistorialContenido">
        <div class="table-responsive">
          <table class="table table-modern align-middle">
            <thead>
              <tr>
                <th>Fecha</th>
                <th class="auro-receta-consulta-th">Consulta</th>
                <th>Paciente</th>
                <th>Especialidad / médico</th>
                <th>CIE-10 / diagnóstico</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="recetasHistorialBody">
              <tr><td colspan="7" class="text-center text-muted py-4">Sin recetas emitidas.</td></tr>
            </tbody>
          </table>
        </div>
        <div id="recetasHistorialMobile" style="display:none;"></div>
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-2" id="recetasPaginacionBox">
          <button type="button" class="btn-soft" id="btnRecetasAnterior">Anterior</button>
          <div class="small text-muted fw-bold" id="recetasPaginaInfo">Página 1 de 1</div>
          <button type="button" class="btn-soft" id="btnRecetasSiguiente">Siguiente</button>
        </div>
      </div>
    `;

    const preview = asegurarVistaPreviaReceta();
    if(preview && preview.parentNode) preview.parentNode.insertBefore(box, preview);
    else seccion.querySelector('.cardx')?.appendChild(box);

    setTimeout(() => {
      el('btnNuevaRecetaERP')?.addEventListener('click', function(){
        limpiarFormularioReceta();
        auroRecetaActualizarCabeceraClinicaPremium();
      });

      el('btnToggleRecetasHistorial')?.addEventListener('click', function(){
        recetasHistorialVisible = !recetasHistorialVisible;
        renderHistorialRecetas();
      });

      el('btnLimpiarFiltroRecetas')?.addEventListener('click', function(){
        setVal('recHistorialBuscar', '');
        setVal('recHistorialFecha', '');
        setVal('recHistorialConsulta', '');
        setVal('recHistorialMedico', '');
        setVal('recHistorialEspecialidad', '');
        recetasPaginaActual = 1;
        renderHistorialRecetas();
      });

      ['recHistorialBuscar','recHistorialConsulta'].forEach(function(id){
        el(id)?.addEventListener('input', function(){
          recetasPaginaActual = 1;
          renderHistorialRecetas();
        });
      });

      ['recHistorialFecha','recHistorialMedico','recHistorialEspecialidad'].forEach(function(id){
        el(id)?.addEventListener('change', function(){
          recetasPaginaActual = 1;
          renderHistorialRecetas();
        });
      });

      el('btnRecetasAnterior')?.addEventListener('click', function(){
        if(recetasPaginaActual > 1){
          recetasPaginaActual--;
          cargarRecetasDesdeSheets(false).then(renderHistorialRecetas);
        }
      });

      el('btnRecetasSiguiente')?.addEventListener('click', function(){
        const total = obtenerRecetasPacienteActivo().length;
        const totalPaginas = Math.max(1, Math.ceil(total / RECETAS_POR_PAGINA));
        if(recetasPaginaActual < totalPaginas){
          recetasPaginaActual++;
          actualizarBotonGuardarReceta();
          renderHistorialRecetas();
        }
      });
    }, 0);

    return box;
  }

  window.renderHistorialRecetas = function(){
    asegurarHistorialRecetas();
    auroRecetaActualizarCabeceraClinicaPremium();

    const body = el('recetasHistorialBody');
    const contador = el('recetasContador');
    const contenido = el('recetasHistorialContenido');
    const filtros = el('recetasFiltrosBox');
    const btnToggle = el('btnToggleRecetasHistorial');
    const pagInfo = el('recetasPaginaInfo');
    const mobile = el('recetasHistorialMobile');
    const btnAnt = el('btnRecetasAnterior');
    const btnSig = el('btnRecetasSiguiente');

    if(!body) return;

    const recetas = obtenerRecetasPacienteActivo();

    if(!recetas.length && !recetasSheetsCargadas && !recetasSheetsCargando){
      if(contador) contador.textContent = 'Cargando recetas desde Google Sheets...';
      cargarRecetasDesdeSheets(false).then(function(){
        renderHistorialRecetas();
      });
      return;
    }

    auroRecetaSincronizarModoPrimeraReceta();

    if(contador){
      contador.textContent = 'Total recetas encontradas: ' + recetas.length;
    }

    if(btnToggle){
      btnToggle.innerHTML = recetasHistorialVisible
        ? '<i class="bi bi-eye-slash me-1"></i> Ocultar recetas'
        : '<i class="bi bi-eye me-1"></i> Mostrar recetas';
    }

    if(filtros) filtros.style.display = recetasHistorialVisible ? '' : 'none';
    if(contenido) contenido.style.display = recetasHistorialVisible ? '' : 'none';

    if(!recetasHistorialVisible){
      return;
    }

    const totalPaginas = Math.max(1, Math.ceil(recetas.length / RECETAS_POR_PAGINA));
    if(recetasPaginaActual > totalPaginas) recetasPaginaActual = totalPaginas;
    if(recetasPaginaActual < 1) recetasPaginaActual = 1;

    const inicio = (recetasPaginaActual - 1) * RECETAS_POR_PAGINA;
    const pagina = recetas.slice(inicio, inicio + RECETAS_POR_PAGINA);

    if(pagInfo) pagInfo.textContent = 'Página ' + recetasPaginaActual + ' de ' + totalPaginas;
    if(btnAnt) btnAnt.disabled = recetasPaginaActual <= 1;
    if(btnSig) btnSig.disabled = recetasPaginaActual >= totalPaginas;

    if(!pagina.length){
      body.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Sin recetas emitidas para este paciente activo.</td></tr>';
      if(mobile) mobile.innerHTML = '<div class="text-muted small py-3">Sin recetas emitidas para este paciente activo.</div>';
      return;
    }

    body.innerHTML = pagina.map(r => {
      const idRaw = String(r.id_receta || '');
      const id = safe(idRaw);
      const menuId = safe(idRaw.replace(/[^a-zA-Z0-9_-]/g, '_'));
      const consulta = r.__consulta ? ('#' + r.__consulta) : '—';
      const pacienteCorto = auroRecetaNombreCortoPaciente(r.__paciente_nombre);
      const diagnostico = recortarTexto(r.diagnostico || '', 58);
      const abierto = String(recetaAccionesAbiertaId) === String(menuId);

      const fila = `<tr>
        <td><b>${safe(fechaVisual(r.fecha_receta))}</b></td>
        <td class="auro-receta-consulta-td"><span class="auro-receta-consulta-badge">${r.__consulta ? 'N.º ' + safe(r.__consulta) : '—'}</span></td>
        <td>${safe(pacienteCorto)}<br><small class="text-muted">${safe(r.__paciente_cedula || '')}</small></td>
        <td class="auro-receta-medico-cell"><b>${safe(r.__especialidad || '—')}</b><small>${safe(r.__medico_nombre || '—')}</small></td>
        <td class="auro-receta-dx-cell"><b>${safe(r.diagnostico_cie10 || '—')}</b><small>${safe(diagnostico)}</small></td>
        <td><span class="badge-auro ${String(r.estado).toLowerCase().includes('anulada') ? 'badge-danger' : 'badge-ok'}">${safe(r.estado || 'Emitida')}</span></td>
        <td>
          <button type="button" class="btn-action primary auro-receta-actions-trigger" onclick="toggleAccionesReceta('${menuId}')"><i class="bi bi-three-dots"></i> Acciones</button>
        </td>
      </tr>`;

      const detalle = abierto ? `<tr class="receta-acciones-row">
        <td colspan="7">
          <div class="auro-receta-actions-panel">
            <div class="auro-receta-actions-title">Acciones de receta</div>
            <div class="auro-receta-actions-buttons">
              <button type="button" class="btn-action soft" onclick="verRecetaEmitida('${id}')"><i class="bi bi-eye"></i> Vista administrativa</button>
              <button type="button" class="btn-action soft" onclick="editarRecetaEmitida('${id}')"><i class="bi bi-pencil-square"></i> Editar receta</button>
              <button type="button" class="btn-action success" onclick="pdfRecetaEmitida('${id}')"><i class="bi bi-file-earmark-medical"></i> Vista paciente / imprimir</button>
            </div>
          </div>
        </td>
      </tr>` : '';

      return fila + detalle;
    }).join('');

    if(mobile){
      const esMovil = (
        window.innerWidth <= 900 ||
        (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
      );

      const tablaWrap = body.closest('.table-responsive');
      if(tablaWrap){
        tablaWrap.style.display = esMovil ? 'none' : '';
      }

      mobile.style.display = esMovil ? 'block' : 'none';
      mobile.style.width = '100%';
      mobile.style.clear = 'both';

      mobile.innerHTML = pagina.map(r => {
        const idRaw = String(r.id_receta || '');
        const idSeguro = safe(idRaw);
        const consulta = r.__consulta ? ('#' + r.__consulta) : '—';
        const pacienteCorto = auroRecetaNombreCortoPaciente(r.__paciente_nombre);
        const diagnostico = recortarTexto(r.diagnostico || '', 90);
        const estadoClase = String(r.estado || '').toLowerCase().includes('anulada') ? 'badge-danger' : 'badge-ok';

        return '<div class="auro-receta-mobile-card" style="display:block;border:1px solid #e5e7eb;border-radius:16px;padding:12px;margin:10px 0;background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.06);">' +
          '<div class="auro-receta-mobile-head" style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:8px;">' +
            '<div><b>' + safe(fechaVisual(r.fecha_receta)) + '</b><br><small class="text-muted">' + idSeguro + '</small></div>' +
            '<span class="badge-auro ' + estadoClase + '">' + safe(r.estado || 'Emitida') + '</span>' +
          '</div>' +
          '<div class="small"><b>Consulta:</b> ' + (r.__consulta ? 'N.º ' + safe(r.__consulta) : '—') + '</div>' +
          '<div class="small"><b>Paciente:</b> ' + safe(pacienteCorto) + (r.__paciente_cedula ? '<br><span class="text-muted">' + safe(r.__paciente_cedula) + '</span>' : '') + '</div>' +
          '<div class="small" style="margin-top:6px;"><b>Especialidad / médico:</b><br><span style="font-weight:900;color:#111827;">' + safe(r.__especialidad || '—') + '</span><br><span class="text-muted">' + safe(r.__medico_nombre || '—') + '</span></div>' +
          '<div class="small"><b>CIE-10:</b> ' + safe(r.diagnostico_cie10 || '—') + '</div>' +
          '<div class="small"><b>Diagnóstico:</b> ' + safe(diagnostico) + '</div>' +
          '<div class="d-grid gap-2 mt-2">' +
            '<button type="button" class="btn-action soft" onclick="verRecetaEmitida(\'' + idSeguro + '\')"><i class="bi bi-eye me-2"></i>Vista administrativa</button>' +
            '<button type="button" class="btn-action soft" onclick="editarRecetaEmitida(\'' + idSeguro + '\')"><i class="bi bi-pencil-square me-2"></i>Editar receta</button>' +
            '<button type="button" class="btn-action success" onclick="pdfRecetaEmitida(\'' + idSeguro + '\')"><i class="bi bi-file-earmark-medical me-2"></i>Vista paciente / imprimir</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }
  };

  function buscarRecetaPorId(id){ return leerRecetasStorage().find(r => String(r.id_receta) === String(id)); }
  function recetaGuardadaAFormatoPreview(r){
    const pacienteCompleto = auroRecetaCompletarPacienteParaImpresion({
      id_paciente: r.id_paciente,
      id_historia: r.id_historia,
      paciente_nombre: r.paciente_nombre,
      paciente_cedula: r.paciente_cedula,
      paciente_telefono: r.paciente_telefono,
      paciente_edad: r.paciente_edad,
      paciente: {
        id_paciente: r.id_paciente,
        nombre: r.paciente_nombre,
        cedula: r.paciente_cedula,
        telefono: r.paciente_telefono,
        edad: r.paciente_edad
      }
    });

    return {
      id_receta:r.id_receta,
      id_atencion:r.id_atencion,
      id_historia:r.id_historia || '',
      id_medico:r.id_medico || obtenerIdMedicoReal(),
      codigo_medico:r.codigo_medico || obtenerCodigoCortoMedico(r.id_medico || obtenerIdMedicoReal()),
      paciente: pacienteCompleto,
      fecha:r.fecha_receta,
      medico:r.medico || obtenerNombreMedicoReal(),
      cie10:r.diagnostico_cie10,
      estado:r.estado,
      diagnosticos:Array.isArray(r.diagnosticos) ? r.diagnosticos : [],
      diagnostico: auroRecetaDiagnosticoGenerico(r.diagnostico)
        ? ''
        : r.diagnostico,
      medicamento:r.medicamento,
      indicaciones:r.indicaciones,
      recomendaciones:r.recomendaciones
    };
  }

  window.auroRecetaEditorSetDato = auroRecetaEditorSetDato;
  window.auroRecetaEditorAgregarMedicamento = auroRecetaEditorAgregarMedicamento;
  window.auroRecetaEditorEliminarMedicamento = auroRecetaEditorEliminarMedicamento;

  window.toggleAccionesReceta = toggleAccionesReceta;

  window.verRecetaEmitida = async function(id){
    const r = buscarRecetaPorId(id);
    if(!r) return alert('No se encontró la receta.');

    await auroRecetaResolverDiagnosticoPorRecetaGuardada(r);
    auroRecetaEntrarModoLectura();

    auroRecetaMostrarPreview(true);
    const box = asegurarVistaPreviaReceta();
    if(box) box.innerHTML = construirHTMLReceta(recetaGuardadaAFormatoPreview(r), 'administrativo');

    mostrarMensajeReceta(
      '<i class="bi bi-lock me-1"></i> Modo lectura activo. Para modificar esta prescripción use <b>Editar receta</b>.',
      ''
    );
  };

  window.editarRecetaEmitida = async function(id){
    const r = buscarRecetaPorId(id);
    if(!r) return alert('No se encontró la receta.');

    await auroRecetaResolverDiagnosticoPorRecetaGuardada(r);
    cargarRecetaEnFormulario(r);

    window.scrollTo({
      top: el('recetas')?.offsetTop || 0,
      behavior:'smooth'
    });
  };

  window.pdfRecetaEmitida = async function(id){
    const r = buscarRecetaPorId(id);
    if(!r) return alert('No se encontró la receta.');

    await auroRecetaResolverDiagnosticoPorRecetaGuardada(r);

    /*
      REFERENCIA OFICIAL:
      esta acción sigue siendo la fuente maestra de representación paciente,
      pero ahora llama directamente al mismo motor interno compartido.
    */
    return auroGenerarPDFRecetaUnificada(
      recetaGuardadaAFormatoPreview(r)
    );
  };

  function agregarBotonVistaPrevia(){
    const seccion = el('recetas'); if(!seccion) return;
    const actions = seccion.querySelector('.section-head .d-flex');
    if(actions && !el('btnVistaPreviaReceta')){
      const btn = document.createElement('button');
      btn.id = 'btnVistaPreviaReceta';
      btn.type = 'button';
      btn.className = 'btn-soft';
      btn.setAttribute('data-auro-receta-action','preview');
      btn.onclick = auroRecetaTogglePreview;
      actions.insertBefore(btn, actions.firstChild);
      auroRecetaActualizarBotonVistaPrevia();
    }
    auroRecetaAfinarInterfazPremium();
  }


  function refrescarRecetasAlEntrar(){
    setTimeout(function(){
      try{
        if(el('recetas') && el('recetas').classList.contains('active')){
          verificarCambioAtencionReceta();
          sincronizarMedicoRecetaDesdeAtencion();
          auroRecetaAfinarInterfazPremium();
          auroRecetaEditorRenderDesdeCampo(false);
          auroRecetaActualizarCabeceraClinicaPremium();
          asegurarHistorialRecetas();
          recetasPaginaActual = 1;
          auroRecetaSincronizarModoPrimeraReceta();
          renderHistorialRecetas();
        }
      }catch(e){}
    }, 250);
  }

  function envolverRecetasFuncion(nombre, despues){
    const original = window[nombre];
    if(typeof original !== 'function' || original.__auroRecetasWrapped) return;

    const nueva = function(){
      const r = original.apply(this, arguments);
      setTimeout(despues, 250);
      return r;
    };

    nueva.__auroRecetasWrapped = true;
    window[nombre] = nueva;
  }

  function manejarCambioAtencionReceta(evento){
    const idEvento = String(
      evento?.detail?.id_atencion ||
      evento?.detail?.atencion?.id_atencion ||
      obtenerIdAtencionActivaSeguro() ||
      ''
    ).trim();

    if(!idEvento) return;

    if(recetaAtencionActualId && recetaAtencionActualId !== idEvento){
      limpiarFormularioRecetaPorCambioAtencion();
      recetaDiagnosticosPorAtencionCache.delete(idEvento);
    }

    recetaAtencionActualId = idEvento;
    recetaPlanAtencionId = String(window.planState?.atencionActual || '').trim();
    setTimeout(function(){
      try{
        auroRecetaSincronizarModoPrimeraReceta();
        auroRecetaActualizarCabeceraClinicaPremium();
      }catch(e){}
    }, 0);
  }

  function inicializarRecetas(){
    recetaAtencionActualId = String(obtenerIdAtencionActivaSeguro() || '').trim();
    recetaPlanAtencionId = String(window.planState?.atencionActual || '').trim();
    instalarEstilosEdicionRecetaPremium();
    auroRecetaAfinarInterfazPremium();
    cargarMedicosActivosReceta(false).then(function(){
      sincronizarMedicoRecetaDesdeAtencion();
      if(el('recetasHistorialBox')) renderHistorialRecetas();
      if(recetaPreviewVisible && el('recetaPreview')) vistaPreviaReceta();
    });
    if(el('recFecha') && !val('recFecha')) setVal('recFecha', fechaHoyReceta());
    setTimeout(function(){
      auroRecetaAutocompletarDiagnosticoSiVacio();
      auroRecetaNormalizarMedicamentosEdicionSiSeguro();
    }, 250);
    agregarBotonVistaPrevia();
    asegurarVistaPreviaReceta();
    auroRecetaMostrarPreview(false);
    auroRecetaEditorMontar();
    auroRecetaEditorRenderDesdeCampo(true);
    auroRecetaActualizarCabeceraClinicaPremium();
    asegurarHistorialRecetas();
    recetaModoTrabajo = 'lectura';
    actualizarBotonGuardarReceta();
    renderHistorialRecetas();
    cargarRecetasDesdeSheets(false).then(function(){
      auroRecetaSincronizarModoPrimeraReceta();
      renderHistorialRecetas();
    });

    envolverRecetasFuncion('showScreen', refrescarRecetasAlEntrar);
    envolverRecetasFuncion('seleccionarPacienteHistoria', refrescarRecetasAlEntrar);
    envolverRecetasFuncion('actualizarTarjetaPacienteHistoria', refrescarRecetasAlEntrar);

    mostrarMensajeReceta('<i class="bi bi-info-circle me-1"></i> La receta puede originarse desde el Plan clínico. Las modificaciones realizadas aquí afectan únicamente el documento de receta y no modifican el Plan de la atención.', '');
  }

  ['aurosanax:atencion-iniciada','aurosanax:atencion-seleccionada','aurosanax:atencion-actualizada'].forEach(function(nombre){
    window.addEventListener(nombre, manejarCambioAtencionReceta);
    document.addEventListener(nombre, manejarCambioAtencionReceta);
  });

  document.addEventListener('DOMContentLoaded', function(){
    auroInstalarMotorPDFRecetaUnificado();
    inicializarRecetas();
  });

  window.addEventListener('load', function(){
    /*
      Última reafirmación después del orden completo de scripts.
      Si impresion.js cargó después, su puente seguirá delegando al motor seguro;
      si cargó antes, recetas.js conserva directamente la función global.
    */
    if(
      window.generarPDFReceta !== auroGenerarPDFRecetaUnificada &&
      window.generarPDFReceta !== window.__auroRecetasConstruirPDFSeguro
    ){
      window.generarPDFReceta = auroGenerarPDFRecetaUnificada;
    }
    window.__auroRecetasConstruirPDFSeguro = function(datos){
      return auroGenerarPDFRecetaUnificada(
        auroRecetaPrepararDatosParaRepresentacion(datos)
      );
    };
  });
  document.addEventListener('input', function(e){ const ids = ['recFecha','recMedico','recCie10','recDiagnostico','recMedicamento','recIndicaciones','recRecomendaciones']; if(recetaPreviewVisible && ids.includes(e.target?.id || '') && el('recetaPreview')){ clearTimeout(window.__auroRecetaPreviewTimer); window.__auroRecetaPreviewTimer = setTimeout(window.vistaPreviaReceta, 250); } });
  document.addEventListener('change', function(e){ const ids = ['recFecha','recEstado']; if(recetaPreviewVisible && ids.includes(e.target?.id || '') && el('recetaPreview')) window.vistaPreviaReceta(); });

  document.addEventListener('aurosanax:diagnosticos-actualizados', function(evento){
    const id = String(
      evento?.detail?.id_atencion || obtenerIdAtencionActivaSeguro() || ''
    ).trim();
    if(id) recetaDiagnosticosPorAtencionCache.delete(id);
  });

  /*
    API PÚBLICA OFICIAL DE RECETAS
    ------------------------------
    Único contrato para accesos externos del ERP.
    No expone funciones de guardado nuevas ni duplica lógica clínica.
  */
  window.auroRecetas = Object.assign({}, window.auroRecetas || {}, {
    version:'3.0 editor tabulado espejo del PDF oficial',
    abrirVistaPacienteOficial:auroRecetaAbrirVistaPacienteOficial,
    cerrarVistaPaciente:auroRecetaCerrarVistaPaciente,
    toggleVistaPaciente:auroRecetaToggleVistaPaciente,
    vistaPacienteAbierta:auroRecetaVistaPacienteAbierta,
    sincronizarEstadoVistaPaciente:auroRecetaActualizarBotonesAccesoGlobal,
    imprimirActual:function(){
      return auroRecetaAbrirVistaPacienteOficial();
    }
  });

  /* Alias IASYN sin retirar el contrato heredado consumido por otros módulos. */
  window.iasynRecetas = window.auroRecetas;

  window.cargarRecetasDesdeSheets = cargarRecetasDesdeSheets;
  window.refrescarRecetasDesdeSheets = function(){
    recetaDiagnosticosPorAtencionCache.clear();
    return cargarRecetasDesdeSheets(true).then(function(){
      renderHistorialRecetas();
      actualizarBotonGuardarReceta();
      return leerRecetasStorage();
    });
  };
  window.__recetasAurosanaxDebug = function(){ return {version:'2.4 contexto de atención y médico reforzado', totalLocal: leerRecetasStorage().length, sheetsCargadas: recetasSheetsCargadas, sheetsCargando: recetasSheetsCargando, recetaEditandoId, recetaNuevaForzada, recetaGuardando, recetaAtencionActualId, pacienteActivo: obtenerPacienteActivoSeguro()?.nombre || '', codigoMedico: obtenerCodigoCortoMedico(), idMedico: obtenerIdMedicoReal(), storageKey: STORAGE_KEY}; };
  window.__recetasIasynDebug = window.__recetasAurosanaxDebug;
})();

/* =====================================================
   IASYN RECETAS 1.9
   - Mantiene compatibilidad con recetas antiguas en texto
   - Guarda indicaciones/recomendaciones como arrays JSON sin duplicados
   - Lee arrays JSON para formulario, historial y PDF
   - Prioriza id_atencion e id_historia de la consulta activa
   - Autocompleta descripción diagnóstica sin reemplazar datos válidos
   - Google Sheets tiene prioridad sobre localStorage
===================================================== */

/* =====================================================
   IASYN RECETAS 2.0 - CONTEXTO SEGURO
   - Limpia formulario al cambiar de consulta
   - No reutiliza medicamentos de otra atención
   - Bloquea guardado sin id_atencion
   - Bloquea Plan perteneciente a otra consulta
   - Bloquea recetas sin medicamentos reales
===================================================== */

/* =====================================================
   IASYN RECETAS 2.1 - DIAGNÓSTICO ESTRUCTURADO
   - Consulta listarDiagnosticosPorAtencion
   - Prioriza diagnóstico principal de la atención activa
   - Conserva código CIE-10 y descripción
   - Bloquea guardado si la descripción no puede resolverse
===================================================== */

/* =====================================================
   IASYN RECETAS 2.2 - DIAGNÓSTICO REAL
   - No acepta “Diagnóstico clínico” como descripción válida
   - No fabrica diagnósticos genéricos
   - Ver / Editar / PDF recuperan la descripción por id_atencion
   - Conserva intacta la separación de Plan y Recetas por consulta
   - No modifica Apps Script, Atenciones ni JSON de medicamentos
===================================================== */

/* =====================================================
   IASYN RECETAS 2.3 - MÉDICO DE LA ATENCIÓN
   - Lee id_medico directamente desde window.getAtencionActiva()
   - Consulta listarMedicosActivos para resolver nombre y registros
   - Sincroniza formulario, vista previa, PDF y guardado
   - Bloquea guardado si la atención no tiene médico
   - Elimina Aurora e ID 397 como fallback automático
===================================================== */

/* =====================================================
   IASYN RECETAS 2.4 - CORRECCIÓN QUIRÚRGICA DUPLICIDAD
   - Reutiliza la receta activa de la misma id_atencion.
   - “Nueva receta” es la única acción que fuerza otra receta.
   - Conserva edición por id_receta, Plan → Receta, PDF e historial.
   - Agrega respaldo de intención al Apps Script con forzar_nueva_receta.
===================================================== */

/* =====================================================
   IASYN RECETAS 2.5 - IMPRESIÓN TABULADA FASES 1 Y 2
   - Cambia únicamente la representación visual del tratamiento.
   - Columnas: medicamento, presentación/concentración, cantidad e indicaciones.
   - Conserva vista previa/PDF, JSON, Plan, guardado, historial y atención.
===================================================== */

/* =====================================================
   IASYN RECETAS 2.6 - FASES 3 Y 4
   - Vista administrativa: conserva Indicaciones para el paciente.
   - Vista paciente / imprimir: no renderiza ese bloque.
   - Mantiene la tabla institucional de medicamentos.
   - No modifica guardado, JSON, Plan, Google Sheets, historial ni sincronización.
===================================================== */

/* =====================================================
   IASYN RECETAS 2.7 - ORIGINAL / COPIA A4 FINAL
   - Duplica únicamente la impresión para paciente.
   - Original arriba y copia abajo, en una sola hoja A4.
   - Corrige ancho, corte lateral, espacios y posición de firma.
   - Cierra la ventana temporal al imprimir, guardar PDF o cancelar.
   - No modifica guardado, JSON, Plan, historial, Google Sheets,
     Apps Script, IDs, eventos ni sincronización.
===================================================== */

/* =====================================================
   IASYN RECETAS 2.8 - VISTA PREVIA GRANDE
   - Vista paciente / imprimir abre primero una vista A4 ampliada.
   - La vista incluye únicamente Imprimir / Guardar PDF y Cerrar.
   - Ya no abre automáticamente el cuadro de impresión.
   - Conserva Original arriba y Copia abajo.
   - No modifica guardado, JSON, Plan, historial, Google Sheets,
     Apps Script, IDs, eventos, listeners ni sincronización.
===================================================== */

/* =====================================================
   IASYN RECETAS 2.9 - ZOOM COMPLETO EN VISTA PREVIA
   - Abre por defecto al 115 %.
   - Agrega controles internos para aumentar, disminuir y ajustar.
   - Mantiene disponible el zoom propio del navegador.
   - La impresión permanece en A4 vertical sin aplicar el zoom visual.
   - No modifica guardado, JSON, Plan, historial, Google Sheets,
     Apps Script, IDs, eventos, listeners ni sincronización.
===================================================== */

/* =====================================================
   IASYN RECETAS 3.0 - MOTOR PDF UNIFICADO
   - El botón PDF de Plan y el botón PDF de Recetas usan el mismo motor.
   - Vista paciente, recetas emitidas e impresión reutilizan la plantilla A4.
   - Original arriba, Copia abajo y controles de zoom sin cambios.
   - El puente __auroRecetasConstruirPDFSeguro llama directamente al motor
     interno y evita ciclos con impresion.js.
   - No modifica Plan, index, botones, IDs, eventos, listeners, guardado,
     JSON, historial, Google Sheets, Apps Script ni sincronización.
===================================================== */

/* =====================================================
   IASYN RECETAS 3.1 - SOLUCIÓN FINAL PDF DESDE PLAN
   - Corrige el caso real: impresion.js pasa obtenerDatosReceta() como
     recetaOpcional, aunque la receta todavía no tenga id_receta.
   - Si no existe id_receta y el Plan pertenece a la atención activa,
     usa medicamentosPlanSeleccionados directamente como JSON estructurado.
   - Una fila por medicamento.
   - Columnas: medicamento, presentación/concentración, cantidad e indicaciones.
   - Vía, frecuencia, duración, observaciones y continuo permanecen agrupados.
   - Las recetas históricas con id_receta no son sustituidas por el Plan activo.
   - No modifica Plan, impresion.js, guardado, JSON persistido, Google Sheets,
     Apps Script, IDs, botones, eventos, listeners ni sincronización.
===================================================== */

/* =====================================================
   IASYN RECETAS 3.2 - AJUSTE FINAL DE IMPRESIÓN
   - Aumenta proporcionalmente la tipografía de Original y Copia.
   - Conserva jerarquías: títulos, encabezados, tabla, firma y pie.
   - Agrega separación central real para facilitar el corte de la hoja.
   - Reequilibra verticalmente ambos ejemplares dentro del A4.
   - Mantiene una sola hoja A4 vertical.
   - No modifica medicamentos, columnas, datos, Plan, guardado, JSON,
     historial, Google Sheets, Apps Script, IDs, botones, eventos,
     listeners, PDF ni sincronización.
===================================================== */

/* =====================================================
   IASYN RECETAS 3.3 - LETRA IMPRESA MÁS GRANDE
   - Aumenta aproximadamente 2 a 3 puntos la tipografía de Original y Copia.
   - Conserva centrado, márgenes, tabla, firma, corte central y una sola hoja A4.
   - Ajusta mínimamente interlineado y rellenos para evitar desbordes.
   - No modifica lógica, medicamentos, Plan, guardado, JSON, historial,
     Google Sheets, Apps Script, IDs, botones, eventos ni sincronización.
===================================================== */

/* =====================================================
   IASYN RECETAS 3.4 - CÉDULA + EDAD EN ENCABEZADO
   - Muestra la cédula debajo del nombre del paciente sin cambiar
     la cuadrícula de 4 columnas ni los espacios del formato A4.
   - Muestra edad como "N años".
   - Si edad no existe, la calcula desde fecha_nacimiento con zona Ecuador.
   - No modifica medicamentos, diagnóstico, Plan, guardado, JSON,
     historial, Google Sheets, Apps Script, IDs, botones ni eventos.
===================================================== */

/* =====================================================
   IASYN RECETAS 3.5 DEFINITIVA - ENCABEZADO PROFESIONAL
   - Seis tarjetas independientes: Paciente, Cédula, Edad,
     Fecha de emisión, N.º de receta y Diagnóstico.
   - Se elimina la tarjeta CIE-10 del encabezado del paciente
     para evitar duplicar el código ya incluido en Diagnóstico.
   - Se elimina el nombre del médico del encabezado superior;
     permanece en la firma inferior.
   - Se elimina la fecha duplicada bajo "RECETA MÉDICA".
   - Mantiene original/copia A4, medicamentos, firma, guardado,
     Plan, Google Sheets, Apps Script, IDs y eventos.
   - Responsive: escritorio, Android, iPhone y iPad.
===================================================== */
