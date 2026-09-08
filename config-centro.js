/* ==========================================================
   IASYN ERP DEMO - CONFIG CENTRO JS
   Versión: 2026-07-06
   Objetivo:
   - Mantener carga y guardado actual de datos del centro.
   - Conectar archivo de logo seleccionado con Apps Script.
   - Subir logo a Google Drive mediante endpoint del scrib.gs.
   - Guardar logo_url en configuracion.
   - No toca pacientes, agenda, historia clínica, recetas ni módulos clínicos.
   ========================================================== */

  let logoCentroArchivoSeleccionado = null;

  function valorConfigCentro(clave, valorDefault){
    const v = configuracionCentro && configuracionCentro[clave] !== undefined ? configuracionCentro[clave] : '';
    return v !== '' && v !== null && v !== undefined ? v : (valorDefault || '');
  }

  function textoSeguroCentro(valor){
    try{
      if(typeof safeText === 'function') return safeText(valor);
    }catch(e){}
    return String(valor === null || valor === undefined ? '' : valor)
      .replace(/[&<>"']/g, function(c){
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[c];
      });
  }

  function extraerDriveFileIdCentro(url){
    const raw = String(url || '').trim();
    if(!raw) return '';

    let m = raw.match(/\/file\/d\/([^/]+)/);
    if(m && m[1]) return decodeURIComponent(m[1]);

    m = raw.match(/[?&]id=([^&]+)/);
    if(m && m[1]) return decodeURIComponent(m[1]);

    if(/^[a-zA-Z0-9_-]{20,}$/.test(raw)) return raw;

    return '';
  }

  function normalizarDriveImageUrl(url){
    const raw = String(url || '').trim();
    if(!raw) return '';

    const id = extraerDriveFileIdCentro(raw);
    if(id) return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w400';

    return raw;
  }

  function obtenerUrlsPreviewLogoCentro(url){
    const raw = String(url || '').trim();
    if(!raw) return [];

    const id = extraerDriveFileIdCentro(raw);
    if(id){
      return [
        'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w400',
        'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(id),
        raw
      ];
    }

    return [raw];
  }

  function obtenerInputLogoArchivoCentro(){
    const ids = [
      'cfgLogoFile',
      'cfgLogoArchivo',
      'cfgLogoInput',
      'logoCentroFile',
      'logoFile',
      'inputLogoCentro'
    ];

    for(const id of ids){
      const el = document.getElementById(id);
      if(el && el.type === 'file') return el;
    }

    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    return inputs.find(el => {
      const txt = String((el.id || '') + ' ' + (el.name || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
      return txt.includes('logo');
    }) || inputs[0] || null;
  }

  function setEstadoArchivoLogoCentro(html){
    const ids = [
      'cfgLogoFileStatus',
      'cfgLogoArchivoEstado',
      'cfgLogoEstado',
      'logoCentroEstado',
      'logoFileStatus',
      'estadoLogoCentro'
    ];

    for(const id of ids){
      const el = document.getElementById(id);
      if(el){ el.innerHTML = html || ''; return; }
    }
  }

  function actualizarPreviewLogoCentro(){
    const input = document.getElementById('cfgLogoUrl');
    const img = document.getElementById('cfgLogoPreview');
    const fallback = document.getElementById('cfgLogoFallback');
    if(!input || !img || !fallback) return;

    const urls = obtenerUrlsPreviewLogoCentro(input.value);
    if(!urls.length){
      img.style.display = 'none';
      fallback.style.display = 'grid';
      img.removeAttribute('src');
      return;
    }

    let intento = 0;
    const cargar = () => {
      const url = urls[intento];
      img.onload = () => { img.style.display = 'block'; fallback.style.display = 'none'; };
      img.onerror = () => {
        intento++;
        if(intento < urls.length){
          cargar();
          return;
        }
        img.style.display = 'none';
        fallback.style.display = 'grid';
      };
      img.src = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    };

    cargar();
  }

  function previsualizarArchivoLogoCentro(file){
    const img = document.getElementById('cfgLogoPreview');
    const fallback = document.getElementById('cfgLogoFallback');
    if(!file || !img || !fallback) return;

    const urlLocal = URL.createObjectURL(file);
    img.onload = () => {
      img.style.display = 'block';
      fallback.style.display = 'none';
      try{ URL.revokeObjectURL(urlLocal); }catch(e){}
    };
    img.onerror = () => {
      img.style.display = 'none';
      fallback.style.display = 'grid';
      try{ URL.revokeObjectURL(urlLocal); }catch(e){}
    };
    img.src = urlLocal;
  }

  function validarArchivoLogoCentro(file){
    if(!file) return {success:false, message:'No se seleccionó archivo.'};

    const tipo = String(file.type || '').toLowerCase();
    const nombre = String(file.name || '').toLowerCase();
    const esImagen = tipo.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(nombre);

    if(!esImagen){
      return {success:false, message:'Seleccione una imagen válida: PNG, JPG, JPEG o WEBP.'};
    }

    const maxBytes = 2 * 1024 * 1024;
    if(file.size > maxBytes){
      return {success:false, message:'El logo es demasiado pesado. Use una imagen menor a 2 MB.'};
    }

    return {success:true};
  }

  function leerArchivoComoDataUrlCentro(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
      reader.readAsDataURL(file);
    });
  }

  function extraerBase64Centro(dataUrl){
    const txt = String(dataUrl || '');
    const idx = txt.indexOf(',');
    return idx >= 0 ? txt.substring(idx + 1) : txt;
  }

  function obtenerUrlLogoDesdeRespuestaCentro(r){
    r = r || {};
    return r.logo_url || r.url_publica || r.url_visual || r.url || r.webViewLink || r.webContentLink || '';
  }

  async function subirLogoCentroSiExiste(){
    const inputUrl = document.getElementById('cfgLogoUrl');
    const file = logoCentroArchivoSeleccionado;

    if(!file) return '';

    const validacion = validarArchivoLogoCentro(file);
    if(!validacion.success) throw new Error(validacion.message);

    setEstadoArchivoLogoCentro('<i class="bi bi-arrow-clockwise me-1"></i> Subiendo logo a Google Drive...');

    const dataUrl = await leerArchivoComoDataUrlCentro(file);
    const base64 = extraerBase64Centro(dataUrl);

    const r = await apiPost('subirLogoCentroDriveERP', {
      nombre_archivo: file.name || 'logo-centro.png',
      mime_type: file.type || 'image/png',
      base64: base64,
      tipo_archivo: 'logo_centro'
    });

    if(!r || !r.success){
      throw new Error((r && r.message) || 'No se pudo subir el logo a Google Drive.');
    }

    const urlLogo = obtenerUrlLogoDesdeRespuestaCentro(r);
    if(!urlLogo){
      throw new Error('El servidor subió el logo, pero no devolvió una URL válida.');
    }

    if(inputUrl){
      inputUrl.value = urlLogo;
      actualizarPreviewLogoCentro();
    }

    setEstadoArchivoLogoCentro('<i class="bi bi-check2-circle me-1"></i> Logo subido correctamente a Google Drive.');

    logoCentroArchivoSeleccionado = null;
    const inputFile = obtenerInputLogoArchivoCentro();
    if(inputFile) inputFile.value = '';

    return urlLogo;
  }

  function inicializarLogoUploaderCentro(){
    const inputFile = obtenerInputLogoArchivoCentro();
    if(!inputFile || inputFile.dataset.iasynLogoInit === '1') return;

    inputFile.dataset.iasynLogoInit = '1';
    inputFile.addEventListener('change', function(){
      const file = this.files && this.files.length ? this.files[0] : null;
      logoCentroArchivoSeleccionado = file || null;

      if(!file){
        setEstadoArchivoLogoCentro('Sin archivo seleccionado.');
        return;
      }

      const validacion = validarArchivoLogoCentro(file);
      if(!validacion.success){
        logoCentroArchivoSeleccionado = null;
        setEstadoArchivoLogoCentro('<span class="text-danger fw-bold">' + textoSeguroCentro(validacion.message) + '</span>');
        alert(validacion.message);
        this.value = '';
        return;
      }

      const kb = Math.round((file.size || 0) / 1024);
      setEstadoArchivoLogoCentro('<i class="bi bi-image me-1"></i> Archivo listo: <b>' + textoSeguroCentro(file.name || 'logo') + '</b> (' + kb + ' KB). Se subirá al guardar.');
      previsualizarArchivoLogoCentro(file);
    });
  }


  /* ==========================================================
     IASYN 2026-08-21 · IDENTIDAD VISUAL DE CONFIGURACIÓN
     QUIRÚRGICO / ANTIRREGRESIVO
     - Sin crear botones ni navegación.
     - Sin tocar seguridad, sesión, permisos ni backend.
     - Solo sincroniza textos visibles con obtenerConfiguracion().
     ========================================================== */
  function aplicarIdentidadVisualConfiguracionCentro(){
    const nombre = String(valorConfigCentro('nombre_clinica', 'IASYN') || 'IASYN').trim();
    const modo = String(valorConfigCentro('modo_sistema', '') || '').trim();

    try{
      document.title = nombre + ' - Configuración';
    }catch(e){}

    const brandTitulo = document.querySelector('#sidebar .brand h1');
    const brandSubtitulo = document.querySelector('#sidebar .brand small');

    if(brandTitulo) brandTitulo.textContent = nombre;
    if(brandSubtitulo) brandSubtitulo.textContent = 'Configuración';

    const banner = document.querySelector('.demo-banner');
    if(banner){
      banner.innerHTML =
        '<div><b>CONFIGURACIÓN INSTITUCIONAL</b> — Administración segura del centro médico.</div>' +
        '<small>Centro: ' + textoSeguroCentro(nombre) +
        (modo ? ' · Modo ' + textoSeguroCentro(modo) : '') +
        '</small>';
    }

    const subtitulo = document.querySelector('.topbar > div:first-child p');
    if(subtitulo){
      subtitulo.textContent =
        'Parámetros institucionales, agenda, seguridad y administración del centro.';
    }

    const tarjetas = Array.from(document.querySelectorAll('.stat'));
    const tarjetaCentro = tarjetas.find(function(card){
      const label = card.querySelector('small');
      return label &&
        String(label.textContent || '').trim().toLowerCase() === 'centro';
    });

    if(tarjetaCentro){
      const valor = tarjetaCentro.querySelector('h3');
      if(valor){
        valor.textContent = nombre;
        valor.title = nombre;
        valor.style.fontSize = '20px';
        valor.style.lineHeight = '1.15';
        valor.style.wordBreak = 'break-word';
      }
    }
  }

  async function cargarConfiguracionCentro(){
    const msg = document.getElementById('centroMsg');
    const requeridos = [
      'cfgNombreClinica','cfgWhatsappClinica','cfgEmailClinica','cfgDireccionClinica',
      'cfgLogoUrl','cfgColorPrincipal','cfgColorSecundario','cfgModoSistema'
    ];
    const faltantes = requeridos.filter(id => !document.getElementById(id));
    if(faltantes.length){
      const detalle = 'Faltan campos de Datos del centro: ' + faltantes.join(', ');
      console.error('IASYN Config Centro:', detalle);
      if(msg) msg.innerHTML = '<span class="text-danger fw-bold">' + textoSeguroCentro(detalle) + '</span>';
      return {success:false, message:detalle};
    }

    try{
      configuracionCentro = await apiGet('obtenerConfiguracion');
      if(!configuracionCentro || typeof configuracionCentro !== 'object' || Array.isArray(configuracionCentro)) configuracionCentro = {};

      document.getElementById('cfgNombreClinica').value = valorConfigCentro('nombre_clinica', 'IASYN DEMO');
      document.getElementById('cfgWhatsappClinica').value = valorConfigCentro('whatsapp_clinica', '');
      document.getElementById('cfgEmailClinica').value = valorConfigCentro('email_clinica', '');
      document.getElementById('cfgDireccionClinica').value = valorConfigCentro('direccion_clinica', '');
      const logoUrlGuardado = valorConfigCentro('logo_url', '');
      const logoFileIdGuardado = valorConfigCentro('logo_file_id', '');
      document.getElementById('cfgLogoUrl').value = logoUrlGuardado || (logoFileIdGuardado ? 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(logoFileIdGuardado) + '&sz=w400' : '');
      document.getElementById('cfgColorPrincipal').value = valorConfigCentro('color_principal', '#8b1e5a');
      document.getElementById('cfgColorSecundario').value = valorConfigCentro('color_secundario', '#c23b83');
      document.getElementById('cfgModoSistema').value = valorConfigCentro('modo_sistema', 'DEMO');
      actualizarPreviewLogoCentro();
      inicializarLogoUploaderCentro();
      aplicarIdentidadVisualConfiguracionCentro();

      if(msg) msg.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Datos institucionales cargados desde la hoja <b>configuracion</b>. Colores y modo sistema están bloqueados por seguridad.';
      return {success:true, data:configuracionCentro};
    }catch(e){
      console.error(e);
      if(msg) msg.innerHTML = '<span class="text-danger fw-bold">Error cargando datos del centro. Revise conexión o Apps Script.</span>';
      return {success:false, message:String(e && e.message || e || 'Error cargando datos del centro.')};
    }
  }

  async function guardarConfiguracionCentro(){
    const msg = document.getElementById('centroMsg');
    const btn = document.getElementById('btnGuardarCentro');

    if(!document.getElementById('cfgNombreClinica').value.trim()){
      alert('Ingrese el nombre del centro médico.');
      return;
    }

    const old = btn ? btn.innerHTML : '';
    if(btn){
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Guardando...';
    }
    if(msg) msg.innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i> Guardando datos institucionales...';

    try{
      if(logoCentroArchivoSeleccionado){
        await subirLogoCentroSiExiste();
      }

      const datosSeguros = {
        nombre_clinica: document.getElementById('cfgNombreClinica').value.trim(),
        whatsapp_clinica: document.getElementById('cfgWhatsappClinica').value.trim(),
        email_clinica: document.getElementById('cfgEmailClinica').value.trim(),
        direccion_clinica: document.getElementById('cfgDireccionClinica').value.trim(),
        logo_url: document.getElementById('cfgLogoUrl').value.trim()
      };

      for(const [clave, valor] of Object.entries(datosSeguros)){
        const r = await apiPost('editarConfiguracion', {clave, valor});
        if(!r.success) throw new Error(r.message || 'No se pudo guardar ' + clave);
      }

      await cargarConfiguracionCentro();
      if(msg) msg.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Configuración institucional guardada correctamente.';
      alert('Datos del centro guardados correctamente.');
    }catch(e){
      console.error(e);
      if(msg) msg.innerHTML = '<span class="text-danger fw-bold">Error: ' + textoSeguroCentro(e.message || e) + '</span>';
      alert('Error al guardar configuración: ' + (e.message || e));
    }finally{
      if(btn){
        btn.disabled = false;
        btn.innerHTML = old;
      }
    }
  }

  window.IASYN_CONFIG_CENTRO = Object.freeze({
    cargar: cargarConfiguracionCentro,
    guardar: guardarConfiguracionCentro,
    actualizarPreviewLogo: actualizarPreviewLogoCentro
  });

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', inicializarLogoUploaderCentro);
  }else{
    inicializarLogoUploaderCentro();
  }
