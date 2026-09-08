/*
IASYN - AISLAMIENTO
- Módulo exclusivamente visual/ortográfico.
- No guarda ni modifica información clínica.
- No usa Apps Script, Google Sheets, Drive ni endpoints externos.
- No reemplaza términos médicos automáticamente.
*/
/*
IASYN Clinical ERP
Archivo: correccion_clinica.js
AYUDA ORTOGRÁFICA CONTROLADA - ANAMNESIS

Objetivo:
- Activar ayudas ortográficas nativas del navegador en campos narrativos.
- Español Ecuador.
- NO reemplaza términos clínicos automáticamente.
- NO guarda datos.
- NO usa Apps Script ni Google Sheets.
*/
(function(){
  'use strict';

  const normalizar = v => String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/\s+/g,' ').trim();

  function textoEtiqueta(campo){
    if(campo.id){
      const label = document.querySelector(`label[for="${CSS.escape(campo.id)}"]`);
      if(label) return normalizar(label.textContent);
    }
    const bloque = campo.closest('.col-md-12,.col-12,.form-group,.mb-3,.mb-2,.clinical-panel,.card,.row') || campo.parentElement;
    return normalizar(bloque?.querySelector('label')?.textContent || '');
  }

  function campoPermitido(campo){
    if(!campo || campo.tagName !== 'TEXTAREA' || !campo.closest('#hc_anamnesis')) return false;
    const et = textoEtiqueta(campo);
    const id = normalizar(campo.id).replace(/\s+/g,'_');
    const claves = ['enfermedad actual','descripcion evolucion','evolucion y caracteristicas','caracteristicas'];
    return claves.some(k => et.includes(normalizar(k)) || id.includes(normalizar(k).replace(/\s+/g,'_')));
  }

  function configurar(campo){
    if(!campoPermitido(campo) || campo.dataset.iasynCorreccionClinica === '1') return;
    campo.dataset.iasynCorreccionClinica = '1';
    campo.setAttribute('lang','es-EC');
    campo.setAttribute('spellcheck','true');
    campo.setAttribute('autocapitalize','sentences');
    campo.setAttribute('autocorrect','on');
  }

  function escanear(){
    document.querySelectorAll('#hc_anamnesis textarea').forEach(configurar);
  }

  function init(){
    escanear();
    const obs = new MutationObserver(escanear);
    obs.observe(document.documentElement,{childList:true,subtree:true});
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
