/****************************************************************
 IASYN ERP
 Archivo: cie10_inteligente.js
 Módulo: Inteligencia clínica asistida por CIE-10
 Versión corregida: 2026-07-07 alias cierre compatible
 ---------------------------------------------------------------
 OBJETIVO:
 - Conectar el diagnóstico CIE-10 seleccionado con:
   catalogo_diagnosticos
   protocolos_clinicos
 - Consultar Apps Script sin romper el flujo actual.
 - Mostrar sugerencias clínicas si existe protocolo.
 - NO aplicar automáticamente medicamentos, órdenes ni indicaciones.
 - NO modificar Examen Físico, Plan Clínico ni Recetas por sí solo.
 - Mantener compatibilidad: si este archivo falla o no carga,
   Examen Físico debe seguir funcionando igual.

 REQUIERE APPS SCRIPT:
 - buscarProtocoloPorCie10
 - listarCatalogoDiagnosticos
 - listarProtocolosClinicos

 USO ESPERADO DESDE examenfisico.js:
 Después de agregar un diagnóstico CIE-10, llamar de forma segura:

 if (typeof window.auroCie10InteligenteBuscarProtocolo === 'function') {
   window.auroCie10InteligenteBuscarProtocolo(codigo, nombre);
 }
****************************************************************/

(function(){
  'use strict';

  const MODULO = 'IASYN CIE10 INTELIGENTE';

  /*
    IASYN - AISLAMIENTO / COMPATIBILIDAD INTERNA TEMPORAL
    -----------------------------------------------------
    Este módulo obtiene el backend exclusivamente desde API_URL definido
    por el index de IASYN. No contiene URLs directas de Apps Script,
    Drive, Sheets ni dominios AUROSANAX.

    Los nombres `window.auroCie10*`, el evento `aurosanax:*` y el fallback
    `MEDICAMENTOS_AUROSANAX_BASE` permanecen temporalmente porque son
    contratos internos compartidos con Diagnóstico, Examen Físico y Plan.
    No representan una conexión activa con AUROSANAX PRUEBA.
  */

  const STATE = {
    ultimoCodigo: '',
    ultimoNombre: '',
    ultimoResultado: null,
    cargando: false,
    aplicandoPlan: false
  };

  function apiUrl(){
    try{
      if(typeof API_URL !== 'undefined' && API_URL) return API_URL;
    }catch(e){}

    if(window.API_URL) return window.API_URL;

    const input = document.getElementById('appsScriptUrl');
    if(input && input.value) return input.value.trim();

    return '';
  }

  function limpiarTexto(valor){
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function normalizarCodigoCie10(codigo){
    return limpiarTexto(codigo).toUpperCase();
  }

  function safeHtml(valor){
    return String(valor || '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }

  function parseJsonSeguro(valor, fallback){
    if(Array.isArray(valor) || (valor && typeof valor === 'object')) return valor;

    const txt = limpiarTexto(valor);
    if(!txt) return fallback;

    try{
      return JSON.parse(txt);
    }catch(e){
      console.warn(MODULO + ': JSON inválido.', e, txt);
      return fallback;
    }
  }

  async function getJSON(accion, params){
    const base = apiUrl();
    if(!base) throw new Error('No se encontró API_URL para consultar Apps Script.');

    const query = new URLSearchParams({ accion });

    Object.keys(params || {}).forEach(k => {
      if(params[k] !== undefined && params[k] !== null){
        query.append(k, params[k]);
      }
    });

    const res = await fetch(base + '?' + query.toString() + '&_=' + Date.now());
    return await res.json();
  }

  function obtenerContenedor(){
    /*
      IASYN FIX QUIRÚRGICO:
      El protocolo inteligente CIE-10 debe existir únicamente dentro de la
      pestaña Diagnóstico, inmediatamente después del editor CIE-10 y antes
      del centro de integración clínica. Nunca se monta junto a Examen físico
      ni en un contenedor global compartido por otras pestañas.
    */
    const panel = document.getElementById('hc_diagnostico');
    const editor = document.getElementById('hcDiagnosticoCieGrupo');
    const integracion = document.getElementById('auroDiagnosticosMount');

    let box = document.getElementById('auroCie10InteligenteBox');
    if(!box){
      box = document.createElement('div');
      box.id = 'auroCie10InteligenteBox';
      box.className = 'auro-cie10-inteligente-box';
      box.style.display = 'none';
    }

    if(panel){
      /* Orden obligatorio: Editor CIE-10 -> Protocolo sugerido -> Integración. */
      if(integracion && integracion.parentElement === panel){
        panel.insertBefore(box, integracion);
      }else if(editor && editor.parentElement === panel){
        editor.insertAdjacentElement('afterend', box);
      }else if(box.parentElement !== panel){
        panel.appendChild(box);
      }
    }else{
      /* Degradación segura: se conserva oculto hasta que exista la pestaña. */
      box.style.display = 'none';
    }

    instalarEstilos();
    return box;
  }

  function instalarEstilos(){
    if(document.getElementById('auro-cie10-inteligente-style')) return;

    const style = document.createElement('style');
    style.id = 'auro-cie10-inteligente-style';
    style.textContent = `
      .auro-cie10-inteligente-box{
        margin:14px 0;
        border:1px solid #fbcfe8;
        border-radius:20px;
        background:linear-gradient(135deg,#ffffff,#fff7fb);
        box-shadow:0 12px 32px rgba(139,30,90,.08);
        overflow:hidden;
      }
      .auro-cie10-head{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:12px;
        padding:14px 16px;
        border-bottom:1px solid #fce7f3;
      }
      .auro-cie10-head h5{
        margin:0;
        font-weight:950;
        color:#8b1e5a;
        font-size:16px;
      }
      .auro-cie10-head p{
        margin:4px 0 0;
        color:#64748b;
        font-size:13px;
        font-weight:700;
      }
      .auro-cie10-body{
        padding:14px 16px 16px;
      }
      .auro-cie10-grid{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:12px;
      }
      .auro-cie10-card{
        border:1px solid #f1d4e5;
        border-radius:16px;
        background:#fff;
        padding:12px;
      }
      .auro-cie10-card h6{
        margin:0 0 8px;
        color:#111827;
        font-weight:950;
        font-size:13px;
      }
      .auro-cie10-list{
        margin:0;
        padding-left:18px;
        color:#334155;
        font-size:13px;
        font-weight:650;
      }
      .auro-cie10-list li{ margin-bottom:5px; }
      .auro-cie10-note{
        color:#64748b;
        font-size:13px;
        font-weight:750;
      }
      .auro-cie10-actions{
        display:flex;
        justify-content:flex-end;
        gap:8px;
        flex-wrap:wrap;
        margin-top:12px;
      }
      .auro-cie10-btn{
        border:0;
        border-radius:13px;
        padding:9px 12px;
        font-size:12px;
        font-weight:900;
        cursor:pointer;
      }
      .auro-cie10-btn.primary{
        background:linear-gradient(135deg,#8b1e5a,#c23b83);
        color:#fff;
      }
      .auro-cie10-btn.soft{
        background:#fdf2f8;
        color:#8b1e5a;
        border:1px solid #fbcfe8;
      }
      .auro-cie10-btn.line{
        background:#fff;
        color:#334155;
        border:1px solid #e5e7eb;
      }
      .auro-cie10-badge{
        display:inline-block;
        padding:4px 9px;
        border-radius:999px;
        background:#fdf2f8;
        color:#8b1e5a;
        font-size:12px;
        font-weight:950;
      }
      @media(max-width:760px){
        .auro-cie10-grid{grid-template-columns:1fr;}
        .auro-cie10-head{display:block;}
        .auro-cie10-actions{display:grid;grid-template-columns:1fr;}
        .auro-cie10-btn{width:100%;}
      }
    `;

    document.head.appendChild(style);
  }

  function ocultarPanel(){
    const box = document.getElementById('auroCie10InteligenteBox');
    if(box){
      box.style.display = 'none';
      box.innerHTML = '';
    }
  }

  function mostrarCargando(codigo, nombre){
    const box = obtenerContenedor();
    box.style.display = 'block';
    box.innerHTML = `
      <div class="auro-cie10-head">
        <div>
          <h5><i class="bi bi-stars me-1"></i> Inteligencia clínica CIE-10</h5>
          <p>Buscando protocolo para <b>${safeHtml(codigo)}</b> ${nombre ? '· ' + safeHtml(nombre) : ''}</p>
        </div>
        <span class="auro-cie10-badge">Consultando</span>
      </div>
      <div class="auro-cie10-body">
        <div class="auro-cie10-note">Consultando protocolos clínicos disponibles...</div>
      </div>
    `;
  }

  function mostrarSinProtocolo(codigo, nombre){
    const box = obtenerContenedor();
    box.style.display = 'block';
    box.innerHTML = `
      <div class="auro-cie10-head">
        <div>
          <h5><i class="bi bi-info-circle me-1"></i> Sin protocolo configurado</h5>
          <p><b>${safeHtml(codigo)}</b> ${nombre ? '· ' + safeHtml(nombre) : ''}</p>
        </div>
        <span class="auro-cie10-badge">Sin datos</span>
      </div>
      <div class="auro-cie10-body">
        <div class="auro-cie10-note">
          El diagnóstico fue agregado correctamente. Todavía no existe un protocolo clínico asociado en <b>protocolos_clinicos</b>.
        </div>
        <div class="auro-cie10-actions">
          <button type="button" class="auro-cie10-btn line" onclick="window.auroCie10InteligenteOcultar()">Cerrar</button>
        </div>
      </div>
    `;
  }

  function listaHTML(items, tipo){
    const lista = Array.isArray(items) ? items : [];

    if(!lista.length){
      return '<div class="auro-cie10-note">Sin sugerencias configuradas.</div>';
    }

    return '<ul class="auro-cie10-list">' + lista.map(item => {
      if(typeof item === 'string'){
        return '<li>' + safeHtml(item) + '</li>';
      }

      if(tipo === 'medicamentos'){
        const partes = [
          item.nombre || item.medicamento || item.med,
          item.presentacion || item.pres,
          item.dosis,
          item.via,
          item.frecuencia || item.frec,
          item.duracion || item.dur,
          item.indicaciones || item.ind
        ].filter(Boolean);
        return '<li>' + safeHtml(partes.join(' - ')) + '</li>';
      }

      if(tipo === 'ordenes'){
        const partes = [
          item.orden || item.nombre,
          item.categoria || item.cat,
          item.observacion || item.obs
        ].filter(Boolean);
        return '<li>' + safeHtml(partes.join(' - ')) + '</li>';
      }

      const partes = Object.keys(item || {}).map(k => item[k]).filter(Boolean);
      return '<li>' + safeHtml(partes.join(' - ')) + '</li>';
    }).join('') + '</ul>';
  }

  function normalizarProtocolo(resultado){
    const protocolo = resultado?.protocolo || null;
    const catalogo = resultado?.catalogo || null;

    if(!protocolo) return { catalogo, protocolo:null };

    return {
      catalogo,
      protocolo,
      medicamentos: parseJsonSeguro(protocolo.medicamentos_json, []),
      ordenes: parseJsonSeguro(protocolo.ordenes_json, []),
      indicaciones: parseJsonSeguro(protocolo.indicaciones_json, []),
      alertas: parseJsonSeguro(protocolo.alertas_json, []),
      controles: parseJsonSeguro(protocolo.controles_json, []),
      criterios: parseJsonSeguro(protocolo.criterios_referencia_json, [])
    };
  }

  function mostrarProtocolo(codigo, nombre, resultado){
    const data = normalizarProtocolo(resultado);
    const p = data.protocolo;

    if(!p){
      mostrarSinProtocolo(codigo, nombre);
      return;
    }

    const box = obtenerContenedor();
    box.style.display = 'block';

    box.innerHTML = `
      <div class="auro-cie10-head">
        <div>
          <h5><i class="bi bi-stars me-1"></i> Protocolo clínico sugerido</h5>
          <p>
            <b>${safeHtml(codigo)}</b> ${nombre ? '· ' + safeHtml(nombre) : ''}
            ${p.nombre_protocolo ? '<br><span>' + safeHtml(p.nombre_protocolo) + '</span>' : ''}
          </p>
        </div>
        <span class="auro-cie10-badge">${safeHtml(p.especialidad || 'Protocolo')}</span>
      </div>

      <div class="auro-cie10-body">
        <div class="auro-cie10-note mb-2">
          Estas son sugerencias asistidas. El médico debe revisar, aceptar, modificar o descartar.
        </div>

        <div class="auro-cie10-grid">
          <div class="auro-cie10-card">
            <h6><i class="bi bi-capsule me-1"></i> Medicamentos sugeridos</h6>
            ${listaHTML(data.medicamentos, 'medicamentos')}
          </div>

          <div class="auro-cie10-card">
            <h6><i class="bi bi-file-earmark-medical me-1"></i> Órdenes sugeridas</h6>
            ${listaHTML(data.ordenes, 'ordenes')}
          </div>

          <div class="auro-cie10-card">
            <h6><i class="bi bi-clipboard-check me-1"></i> Indicaciones</h6>
            ${listaHTML(data.indicaciones, 'indicaciones')}
          </div>

          <div class="auro-cie10-card">
            <h6><i class="bi bi-exclamation-triangle me-1"></i> Alertas / controles</h6>
            ${listaHTML([].concat(data.alertas || [], data.controles || [], data.criterios || []), 'alertas')}
          </div>
        </div>

        <div class="auro-cie10-actions">
          <button type="button" class="auro-cie10-btn line" onclick="window.auroCie10InteligenteOcultar()">Cerrar</button>
          <button type="button" class="auro-cie10-btn soft" onclick="window.auroCie10InteligenteCopiarResumen()">Copiar resumen</button>
          <button type="button" class="auro-cie10-btn primary" onclick="window.auroCie10InteligenteAplicarAlPlan()">Aplicar al Plan</button>
        </div>
      </div>
    `;
  }

  function textoResumenProtocolo(){
    const resultado = STATE.ultimoResultado;
    const data = normalizarProtocolo(resultado);

    if(!data.protocolo) return '';

    const partes = [];

    partes.push('Protocolo sugerido para ' + STATE.ultimoCodigo + (STATE.ultimoNombre ? ' - ' + STATE.ultimoNombre : ''));

    if(data.medicamentos?.length){
      partes.push('Medicamentos:');
      data.medicamentos.forEach((m,i) => {
        if(typeof m === 'string'){
          partes.push((i+1) + '. ' + m);
        }else{
          partes.push((i+1) + '. ' + [
            m.nombre || m.medicamento || m.med,
            m.presentacion || m.pres,
            m.dosis,
            m.via,
            m.frecuencia || m.frec,
            m.duracion || m.dur,
            m.indicaciones || m.ind
          ].filter(Boolean).join(' - '));
        }
      });
    }

    if(data.ordenes?.length){
      partes.push('Órdenes:');
      data.ordenes.forEach((o,i) => {
        if(typeof o === 'string'){
          partes.push((i+1) + '. ' + o);
        }else{
          partes.push((i+1) + '. ' + [
            o.orden || o.nombre,
            o.categoria || o.cat,
            o.observacion || o.obs
          ].filter(Boolean).join(' - '));
        }
      });
    }

    if(data.indicaciones?.length){
      partes.push('Indicaciones:');
      data.indicaciones.forEach((x,i) => {
        partes.push((i+1) + '. ' + (typeof x === 'string' ? x : Object.values(x).filter(Boolean).join(' - ')));
      });
    }

    if(data.alertas?.length){
      partes.push('Alertas:');
      data.alertas.forEach((x,i) => {
        partes.push((i+1) + '. ' + (typeof x === 'string' ? x : Object.values(x).filter(Boolean).join(' - ')));
      });
    }

    if(data.controles?.length){
      partes.push('Controles:');
      data.controles.forEach((x,i) => {
        partes.push((i+1) + '. ' + (typeof x === 'string' ? x : Object.values(x).filter(Boolean).join(' - ')));
      });
    }

    return partes.join('\n');
  }

  /* =====================================================
     MOTOR SEGURO CIE10 → PLAN
     Objetivo:
     - Convertir medicamentos del protocolo en el MISMO formato
       que usa el Plan al agregar medicamentos manualmente.
     - No guardar en Sheets aquí.
     - Solo alimentar window.medicamentosPlanSeleccionados.
     ===================================================== */

  function normalizarTextoBusquedaCie10(txt){
    return String(txt || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/\+/g,' mas ')
      .replace(/[^a-z0-9\s]/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function tokenizarTextoCie10(txt){
    const palabrasVacias = new Set([
      'de','del','la','el','los','las','y','o','u','en','por','para','con','sin',
      'segun','esquema','medico','indicacion','tratamiento','automatico','sugerir',
      'vaginal','oral','vo','topica','topico','tableta','capsula','ovulo','crema',
      'unguento','mg','g','ml','ui','dosis'
    ]);

    return normalizarTextoBusquedaCie10(txt)
      .split(' ')
      .map(x => x.trim())
      .filter(x => x && x.length > 2 && !palabrasVacias.has(x));
  }

  function extraerNombreMedicamentoProtocolo(item){
    if(typeof item === 'string') return limpiarTexto(item);

    return limpiarTexto(
      item?.med ||
      item?.medicamento ||
      item?.nombre ||
      item?.nombre_medicamento ||
      item?.principio_activo ||
      item?.farmaco ||
      ''
    );
  }

  function mapaMedicamentosFallbackCie10(){
    /*
      Catálogo auxiliar mínimo para medicamentos que todavía no existen
      en MEDICAMENTOS_IASYN_BASE (o su alias heredado), pero que sí pueden venir desde
      protocolos clínicos. No reemplaza al catálogo principal del Plan.
    */
    return [
      {cat:'GINECOLOGÍA', med:'Clindamicina vaginal', pres:'2% crema vaginal', via:'Vaginal', cantidad:'', frec:'cada noche', dur:'7 noches', ind:'Aplicar antes de dormir'},
      {cat:'GINECOLOGÍA', med:'Clindamicina', pres:'300 mg cápsula', via:'VO', cantidad:'', frec:'cada 12 horas', dur:'7 días', ind:'Tomar según indicación médica'},
      {cat:'GINECOLOGÍA', med:'Clotrimazol óvulo vaginal', pres:'óvulo vaginal', via:'Vaginal', cantidad:'', frec:'cada noche', dur:'7 noches', ind:'Aplicar antes de dormir'},
      {cat:'GINECOLOGÍA', med:'Miconazol vaginal', pres:'óvulo/crema vaginal', via:'Vaginal', cantidad:'', frec:'cada noche', dur:'7 noches', ind:'Aplicar antes de dormir'},
      {cat:'GINECOLOGÍA', med:'Nistatina vaginal', pres:'óvulo vaginal', via:'Vaginal', cantidad:'', frec:'cada noche', dur:'7 a 14 noches', ind:'Aplicar antes de dormir'},
      {cat:'GINECOLOGÍA', med:'Metronidazol vaginal', pres:'gel/óvulo vaginal', via:'Vaginal', cantidad:'', frec:'cada noche', dur:'5 a 7 noches', ind:'Aplicar antes de dormir'},
      {cat:'GINECOLOGÍA', med:'Doxiciclina', pres:'100 mg tableta/cápsula', via:'VO', cantidad:'', frec:'cada 12 horas', dur:'7 días', ind:'Tomar con abundante agua'},
      {cat:'GINECOLOGÍA', med:'Azitromicina', pres:'500 mg tableta', via:'VO', cantidad:'', frec:'dosis única o según esquema', dur:'1 día', ind:'Tomar según indicación médica'},
      {cat:'GINECOLOGÍA', med:'Ceftriaxona', pres:'500 mg ampolla', via:'IM', cantidad:'', frec:'dosis única', dur:'1 día', ind:'Aplicación por personal de salud'},
      {cat:'UROLOGÍA', med:'Nitrofurantoína', pres:'100 mg cápsula', via:'VO', cantidad:'', frec:'cada 12 horas', dur:'5 días', ind:'Tomar con alimentos'},
      {cat:'UROLOGÍA', med:'Fosfomicina trometamol', pres:'3 g sobre', via:'VO', cantidad:'', frec:'dosis única', dur:'1 día', ind:'Disolver en agua y tomar según indicación'},
      {cat:'MEDICINA GENERAL', med:'Losartán', pres:'50 mg tableta', via:'VO', cantidad:'', frec:'cada día', dur:'según control', ind:'Controlar presión arterial'},
      {cat:'MEDICINA GENERAL', med:'Enalapril', pres:'10 mg tableta', via:'VO', cantidad:'', frec:'cada 12 a 24 horas', dur:'según control', ind:'Controlar presión arterial'},
      {cat:'MEDICINA GENERAL', med:'Amlodipino', pres:'5 mg tableta', via:'VO', cantidad:'', frec:'cada día', dur:'según control', ind:'Controlar presión arterial'},
      {cat:'ENDOCRINOLOGÍA / GINECOLOGÍA', med:'Metformina', pres:'500 mg tableta', via:'VO', cantidad:'', frec:'cada 12 horas', dur:'según control', ind:'Tomar con alimentos'},
      {cat:'GINECOLOGÍA', med:'Ácido fólico', pres:'1 mg tableta', via:'VO', cantidad:'', frec:'cada día', dur:'según indicación', ind:'Tomar diariamente'},
      {cat:'GINECOLOGÍA', med:'Espironolactona', pres:'25 mg tableta', via:'VO', cantidad:'', frec:'cada día', dur:'según control', ind:'Usar solo bajo criterio médico'},
      {cat:'GINECOLOGÍA', med:'Medroxiprogesterona', pres:'10 mg tableta', via:'VO', cantidad:'', frec:'cada día', dur:'según esquema', ind:'Tomar según indicación médica'},
      {cat:'GINECOLOGÍA', med:'Letrozol', pres:'2.5 mg tableta', via:'VO', cantidad:'', frec:'cada día', dur:'según esquema reproductivo', ind:'Usar solo bajo indicación médica'},
      {cat:'GINECOLOGÍA', med:'Ácido tranexámico', pres:'500 mg tableta', via:'VO', cantidad:'', frec:'cada 8 horas', dur:'3 a 5 días', ind:'Usar durante sangrado según indicación'},
      {cat:'GINECOLOGÍA', med:'Anticonceptivo hormonal combinado', pres:'tableta', via:'VO', cantidad:'', frec:'cada día', dur:'según esquema', ind:'Usar según indicación médica'},
      {cat:'GINECOLOGÍA', med:'Progestágeno', pres:'tableta', via:'VO', cantidad:'', frec:'según esquema', dur:'según indicación', ind:'Usar según criterio médico'},
      {cat:'MEDICINA GENERAL', med:'Hierro oral', pres:'tableta/cápsula', via:'VO', cantidad:'', frec:'cada día', dur:'según control', ind:'Tomar separado de lácteos si es posible'}
    ];
  }

  function obtenerCatalogoMedicamentosCie10(){
    const basePlan = Array.isArray(window.MEDICAMENTOS_IASYN_BASE)
      ? window.MEDICAMENTOS_IASYN_BASE
      : (Array.isArray(window.MEDICAMENTOS_AUROSANAX_BASE)
          ? window.MEDICAMENTOS_AUROSANAX_BASE
          : []);

    return basePlan.concat(mapaMedicamentosFallbackCie10());
  }

  function puntuarCoincidenciaMedicamentoCie10(query, item){
    const qNorm = normalizarTextoBusquedaCie10(query);
    const nombre = item?.med || item?.medicamento || item?.nombre || '';
    const textoItem = [nombre, item?.pres, item?.via, item?.cat].filter(Boolean).join(' ');
    const itemNorm = normalizarTextoBusquedaCie10(textoItem);
    const nombreNorm = normalizarTextoBusquedaCie10(nombre);

    if(!qNorm || !nombreNorm) return 0;

    let score = 0;

    if(nombreNorm === qNorm) score += 100;
    if(nombreNorm.includes(qNorm)) score += 80;
    if(qNorm.includes(nombreNorm)) score += 70;
    if(itemNorm.includes(qNorm)) score += 40;

    const qTokens = tokenizarTextoCie10(qNorm);
    const nTokens = tokenizarTextoCie10(nombreNorm);
    const itemTokens = tokenizarTextoCie10(itemNorm);

    qTokens.forEach(t => {
      if(nTokens.includes(t)) score += 20;
      else if(itemTokens.includes(t)) score += 10;
    });

    // Preferencias clínicas simples según texto del protocolo.
    if(qNorm.includes('vaginal') && itemNorm.includes('vaginal')) score += 20;
    if(qNorm.includes('ovulo') && itemNorm.includes('ovulo')) score += 15;
    if(qNorm.includes('crema') && itemNorm.includes('crema')) score += 15;
    if(qNorm.includes('oral') && (itemNorm.includes(' vo ') || itemNorm.endsWith(' vo'))) score += 10;

    return score;
  }

  function buscarMedicamentoEnCatalogoPlan(nombre){
    const q = limpiarTexto(nombre);
    if(!q) return null;

    const catalogo = obtenerCatalogoMedicamentosCie10();
    let mejor = null;
    let mejorScore = 0;

    catalogo.forEach(item => {
      const score = puntuarCoincidenciaMedicamentoCie10(q, item);
      if(score > mejorScore){
        mejorScore = score;
        mejor = item;
      }
    });

    // Umbral bajo pero seguro para permitir "Clotrimazol óvulo vaginal" → "Clotrimazol".
    return mejorScore >= 20 ? mejor : null;
  }

  function construirMedicamentoPlanDesdeProtocolo(item){
    const obj = (item && typeof item === 'object' && !Array.isArray(item)) ? item : {};
    const nombre = extraerNombreMedicamentoProtocolo(item);
    const catalogo = buscarMedicamentoEnCatalogoPlan(nombre) || {};

    const med = limpiarTexto(
      obj.med ||
      obj.medicamento ||
      obj.nombre ||
      obj.nombre_medicamento ||
      catalogo.med ||
      nombre ||
      ''
    );

    if(!med || normalizarTextoBusquedaCie10(med).includes('no sugerir medicamentos automaticos')){
      return null;
    }

    return {
      med,
      pres: limpiarTexto(obj.pres || obj.presentacion || obj.presentacion_farmaceutica || catalogo.pres || ''),
      via: limpiarTexto(obj.via || obj.vía || catalogo.via || ''),
      cantidad: limpiarTexto(obj.cantidad || obj.cant || catalogo.cantidad || ''),
      frec: limpiarTexto(obj.frec || obj.frecuencia || obj.intervalo || catalogo.frec || ''),
      dur: limpiarTexto(obj.dur || obj.duracion || obj.duración || catalogo.dur || ''),
      ind: limpiarTexto(obj.ind || obj.indicaciones || obj.observacion || obj.observación || catalogo.ind || ''),
      continuo: limpiarTexto(obj.continuo || obj.tratamiento_continuo || 'No') || 'No'
    };
  }

  function firmaMedicamentoPlan(m){
    return normalizarTextoBusquedaCie10([
      m?.med || '',
      m?.pres || '',
      m?.via || '',
      m?.frec || '',
      m?.dur || ''
    ].join(' '));
  }

  function fusionarMedicamentoPlanExistente(existente, nuevo){
    if(!existente || !nuevo) return;

    ['pres','via','cantidad','frec','dur','ind','continuo'].forEach(k => {
      if(!limpiarTexto(existente[k]) && limpiarTexto(nuevo[k])){
        existente[k] = nuevo[k];
      }
    });
  }

  function aplicarMedicamentosAlPlan(medicamentos){
    if(!Array.isArray(medicamentos) || !medicamentos.length) return 0;

    window.medicamentosPlanSeleccionados = Array.isArray(window.medicamentosPlanSeleccionados)
      ? window.medicamentosPlanSeleccionados
      : [];

    let agregados = 0;

    medicamentos.forEach(m => {
      const medPlan = construirMedicamentoPlanDesdeProtocolo(m);
      if(!medPlan || !medPlan.med) return;

      const firmaNueva = firmaMedicamentoPlan(medPlan);
      const existente = window.medicamentosPlanSeleccionados.find(x => firmaMedicamentoPlan(x) === firmaNueva);

      if(existente){
        fusionarMedicamentoPlanExistente(existente, medPlan);
        return;
      }

      window.medicamentosPlanSeleccionados.push(medPlan);
      agregados++;
    });

    if(typeof window.renderMedicamentosPlanTabla === 'function'){
      window.renderMedicamentosPlanTabla();
    }

    if(typeof window.sincronizarPlanConReceta === 'function'){
      window.sincronizarPlanConReceta();
    }

    if(typeof window.guardarPlanTemporal === 'function'){
      window.guardarPlanTemporal();
    }

    return agregados;
  }

  function firmaOrdenPlan(o){
    return normalizarTextoBusquedaCie10([
      o?.orden || o?.nombre || '',
      o?.cat || o?.categoria || '',
      o?.obs || o?.observacion || ''
    ].join(' '));
  }

  function aplicarOrdenesAlPlan(ordenes){
    if(!Array.isArray(ordenes) || !ordenes.length) return 0;

    window.ordenesMedicasPlanSeleccionadas = Array.isArray(window.ordenesMedicasPlanSeleccionadas)
      ? window.ordenesMedicasPlanSeleccionadas
      : [];

    let agregadas = 0;

    ordenes.forEach(o => {
      const ordenPlan = (typeof o === 'string')
        ? { orden: o, cat: 'OTROS', obs: '' }
        : {
            orden: o?.orden || o?.nombre || '',
            cat: o?.categoria || o?.cat || 'OTROS',
            obs: o?.observacion || o?.obs || ''
          };

      if(!limpiarTexto(ordenPlan.orden)) return;

      const firmaNueva = firmaOrdenPlan(ordenPlan);
      const existe = window.ordenesMedicasPlanSeleccionadas.some(x => firmaOrdenPlan(x) === firmaNueva);

      if(existe) return;

      window.ordenesMedicasPlanSeleccionadas.push(ordenPlan);
      agregadas++;
    });

    if(typeof window.renderOrdenesMedicasTabla === 'function'){
      window.renderOrdenesMedicasTabla();
    }

    if(typeof window.recopilarOrdenesMedicasPlan === 'function'){
      window.recopilarOrdenesMedicasPlan();
    }

    return agregadas;
  }

  function textoIndicacionPlan(x){
    if(typeof x === 'string') return limpiarTexto(x);
    return limpiarTexto(Object.values(x || {}).filter(Boolean).join(' - '));
  }

  function aplicarIndicacionesAlPlan(indicaciones, controles){
    const lista = []
      .concat(Array.isArray(indicaciones) ? indicaciones : [])
      .concat(Array.isArray(controles) ? controles : []);

    if(!lista.length) return 0;

    const campo = document.getElementById('hcIndicacionesPaciente');
    if(!campo) return 0;

    const existentes = String(campo.value || '')
      .split(/\r?\n/)
      .map(x => limpiarTexto(x))
      .filter(Boolean);

    const firmasExistentes = new Set(existentes.map(normalizarTextoBusquedaCie10));
    const nuevas = [];

    lista.forEach(x => {
      const texto = textoIndicacionPlan(x);
      if(!texto) return;

      const firma = normalizarTextoBusquedaCie10(texto);
      if(!firma || firmasExistentes.has(firma)) return;

      firmasExistentes.add(firma);
      nuevas.push(texto);
    });

    if(!nuevas.length) return 0;

    const actual = String(campo.value || '').trim();
    campo.value = actual ? actual + '\n' + nuevas.join('\n') : nuevas.join('\n');

    return nuevas.length;
  }

  window.auroCie10InteligenteBuscarProtocolo = async function(codigo, nombre){
    codigo = normalizarCodigoCie10(codigo);
    nombre = limpiarTexto(nombre);

    if(!codigo) return null;

    STATE.ultimoCodigo = codigo;
    STATE.ultimoNombre = nombre;
    STATE.ultimoResultado = null;
    STATE.cargando = true;

    try{
      mostrarCargando(codigo, nombre);

      const resultado = await getJSON('buscarProtocoloPorCie10', {
        codigo_cie10: codigo
      });

      STATE.ultimoResultado = resultado;
      STATE.cargando = false;

      if(!resultado || resultado.success === false){
        mostrarSinProtocolo(codigo, nombre);
        return resultado || null;
      }

      mostrarProtocolo(codigo, nombre, resultado);
      return resultado;

    }catch(error){
      STATE.cargando = false;
      console.warn(MODULO + ': no se pudo consultar protocolo.', error);

      const box = obtenerContenedor();
      box.style.display = 'block';
      box.innerHTML = `
        <div class="auro-cie10-head">
          <div>
            <h5><i class="bi bi-exclamation-triangle me-1"></i> Inteligencia CIE-10 no disponible</h5>
            <p>El diagnóstico fue agregado, pero no se pudo consultar el protocolo.</p>
          </div>
          <span class="auro-cie10-badge">Sin conexión</span>
        </div>
        <div class="auro-cie10-body">
          <div class="auro-cie10-note">${safeHtml(error.message || error)}</div>
          <div class="auro-cie10-actions">
            <button type="button" class="auro-cie10-btn line" onclick="window.auroCie10InteligenteOcultar()">Cerrar</button>
          </div>
        </div>
      `;

      return null;
    }
  };

  window.auroCie10InteligenteOcultar = function(){
    ocultarPanel();
  };

  /* =====================================================
     COMPATIBILIDAD INTERNA IASYN
     Alias requerido por pruebas e integración:
     - Cerrar y Ocultar hacen exactamente lo mismo.
     - No modifica Examen Físico, Plan, Recetas ni Apps Script.
     ===================================================== */
  window.auroCie10InteligenteCerrar = window.auroCie10InteligenteOcultar;

  window.auroCie10InteligenteCopiarResumen = async function(){
    const txt = textoResumenProtocolo();

    if(!txt){
      alert('No hay protocolo para copiar.');
      return;
    }

    try{
      await navigator.clipboard.writeText(txt);
      alert('Resumen del protocolo copiado.');
    }catch(e){
      alert(txt);
    }
  };

  window.auroCie10InteligenteAplicarAlPlan = async function(){
    if(STATE.aplicandoPlan) return;

    const resultado = STATE.ultimoResultado;
    const data = normalizarProtocolo(resultado);

    if(!data.protocolo){
      alert('No hay protocolo para aplicar.');
      return;
    }

    const confirmar = confirm(
      'Esto guardará el diagnóstico estructurado de la consulta y agregará las sugerencias al Plan Clínico.\n\n' +
      'Revise y modifique antes de guardar o emitir receta.\n\n' +
      '¿Desea continuar?'
    );

    if(!confirmar) return;

    STATE.aplicandoPlan = true;

    try{
      /*
        IASYN FIX QUIRÚRGICO 2026-07-30:
        El botón oficial del CIE guarda primero el diagnóstico estructurado
        de la atención activa. Así Plan y Recetas consultan la misma fila
        persistida por id_atencion, sin restaurar interceptores globales ni
        modificar Examen Físico, Plan, Recetas o Apps Script.
      */
      if(typeof window.auroGuardarDiagnosticosAtencionActual !== 'function'){
        alert(
          'No está disponible la función de guardado del diagnóstico estructurado.\n\n' +
          'No se aplicó el protocolo para evitar que Plan y Receta queden desincronizados.'
        );
        return;
      }

      const guardadoDx = await Promise.resolve(
        window.auroGuardarDiagnosticosAtencionActual()
      );

      if(!guardadoDx || guardadoDx.success === false){
        alert(
          guardadoDx?.message ||
          'No se pudo guardar el diagnóstico estructurado de esta consulta. No se aplicó el protocolo.'
        );
        return;
      }

      const meds = aplicarMedicamentosAlPlan(data.medicamentos);
      const ords = aplicarOrdenesAlPlan(data.ordenes);
      const inds = aplicarIndicacionesAlPlan(data.indicaciones, data.controles);

      if(typeof window.guardarPlanTemporal === 'function'){
        window.guardarPlanTemporal();
      }

      try{
        document.dispatchEvent(new CustomEvent('aurosanax:diagnosticos-actualizados', {
          detail: {
            id_atencion: guardadoDx.id_atencion || '',
            id_examen: guardadoDx.id_examen || '',
            origen: 'cie10_inteligente'
          }
        }));
      }catch(_e){}

      alert(
        'Diagnóstico guardado y sugerencias aplicadas al Plan:\n' +
        '- Medicamentos: ' + meds + '\n' +
        '- Órdenes: ' + ords + '\n' +
        '- Indicaciones/controles: ' + inds + '\n\n' +
        'Debe revisar antes de guardar.'
      );
    }catch(error){
      console.error(MODULO + ': error guardando diagnóstico y aplicando protocolo.', error);
      alert(
        'No se pudo completar la aplicación al Plan: ' +
        (error?.message || String(error))
      );
    }finally{
      STATE.aplicandoPlan = false;
    }
  };

  window.auroCie10InteligenteEstado = function(){
    return JSON.parse(JSON.stringify(STATE));
  };

  /* Alias IASYN sin romper las llamadas heredadas desde otros módulos. */
  window.iasynCie10InteligenteBuscarProtocolo = window.auroCie10InteligenteBuscarProtocolo;
  window.iasynCie10InteligenteOcultar = window.auroCie10InteligenteOcultar;
  window.iasynCie10InteligenteCerrar = window.auroCie10InteligenteCerrar;
  window.iasynCie10InteligenteCopiarResumen = window.auroCie10InteligenteCopiarResumen;
  window.iasynCie10InteligenteAplicarAlPlan = window.auroCie10InteligenteAplicarAlPlan;
  window.iasynCie10InteligenteEstado = window.auroCie10InteligenteEstado;

  console.info(MODULO + ': módulo cargado correctamente.');

})();
