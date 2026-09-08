/**
 * IASYN CLINICAL ERP
 * Archivo: instalacion.js
 * Módulo: Instalador técnico independiente
 * Versión: 1.0.0
 *
 * REGLAS
 * - NO depende de iasyn-config.js para poder arrancar una copia nueva.
 * - NO modifica identidad del centro, usuarios normales, finanzas ni clínica.
 * - El Web App se pega una sola vez en esta pantalla para bootstrap.
 * - Después de instalar, muestra la línea exacta que debe quedar en iasyn-config.js.
 */
(function () {
  'use strict';

  const VERSION = '1.0.0';
  const STORAGE_WEBAPP = 'iasyn_setup_webapp_url_v1';

  const $ = (id) => document.getElementById(id);
  const refs = {
    webAppUrl: $('webAppUrl'),
    spreadsheetRef: $('spreadsheetRef'),
    driveRootRef: $('driveRootRef'),
    btnVerificar: $('btnVerificar'),
    btnInstalar: $('btnInstalar'),
    mensaje: $('mensaje'),
    credenciales: $('credenciales'),
    credUsuario: $('credUsuario'),
    credClave: $('credClave'),
    frontendPaso: $('frontendPaso'),
    lineaConfig: $('lineaConfig'),
    btnCopiarConfig: $('btnCopiarConfig'),
    btnIrLogin: $('btnIrLogin')
  };

  const statusIds = [
    'stWebApp','stSheet','stConexion','stDrive',
    'stDocumentos','stSeguridad','stFinal'
  ];

  function texto(v) {
    return String(v === null || v === undefined ? '' : v).trim();
  }

  function webAppValida(url) {
    try {
      const u = new URL(texto(url));
      return u.protocol === 'https:' &&
        u.hostname === 'script.google.com' &&
        /^\/macros\/s\/[^/]+\/exec\/?$/.test(u.pathname);
    } catch (_e) {
      return false;
    }
  }

  function endpoint() {
    const url = texto(refs.webAppUrl.value);
    if (!webAppValida(url)) {
      throw new Error('Pegue una URL válida /exec del Web App de esta instalación.');
    }
    return url.replace(/\/+$/, '');
  }

  function setMensaje(msg, tipo) {
    refs.mensaje.className = 'notice' + (tipo ? ' ' + tipo : '');
    refs.mensaje.textContent = msg || '';
  }

  function setStatus(id, estado, detalle) {
    const el = $(id);
    if (!el) return;
    const pill = el.querySelector('.pill');
    const small = el.querySelector('small');

    el.classList.remove('ok','warn','bad');
    pill.classList.remove('ok','warn','bad');

    const mapa = {
      ok: ['ok','Correcto'],
      warn: ['warn','Atención'],
      bad: ['bad','Error'],
      pending: ['', 'Pendiente']
    };
    const cfg = mapa[estado] || mapa.pending;
    if (cfg[0]) {
      el.classList.add(cfg[0]);
      pill.classList.add(cfg[0]);
    }
    pill.textContent = cfg[1];
    if (detalle) small.textContent = detalle;
  }

  function resetStatus() {
    statusIds.forEach(id => setStatus(id, 'pending'));
  }

  function setLoading(cargando) {
    refs.btnInstalar.disabled = Boolean(cargando);
    refs.btnVerificar.disabled = Boolean(cargando);
    refs.btnInstalar.classList.toggle('loading', Boolean(cargando));
    const t = refs.btnInstalar.querySelector('.btn-text');
    if (t) t.textContent = cargando ? 'Instalando…' : 'Instalar IASYN';
  }

  async function leerJson(res) {
    const txt = await res.text();
    try {
      return JSON.parse(txt);
    } catch (_e) {
      throw new Error('El Web App respondió, pero no devolvió JSON válido.');
    }
  }

  async function apiGet(accion) {
    const base = endpoint();
    const url = base + '?accion=' + encodeURIComponent(accion) + '&t=' + Date.now();
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) throw new Error('Error HTTP ' + res.status + '.');
    return leerJson(res);
  }

  async function apiPost(accion, data) {
    const base = endpoint();
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion: accion, data: data || {} })
    });
    if (!res.ok) throw new Error('Error HTTP ' + res.status + '.');
    return leerJson(res);
  }

  function pintarEstado(data) {
    data = data || {};
    const base = data.instalacion_base || {};
    const conn = data.conexion || {};
    const drive = data.drive || {};
    const seguridad = data.seguridad || {};

    setStatus(
      'stWebApp',
      webAppValida(texto(refs.webAppUrl.value)) ? 'ok' : 'bad',
      webAppValida(texto(refs.webAppUrl.value)) ? 'Endpoint /exec válido' : 'Falta URL /exec válida'
    );

    setStatus(
      'stSheet',
      base.instalado && base.spreadsheet_id_guardado ? 'ok' : 'warn',
      base.spreadsheet_nombre_guardado || 'Aún no registrado'
    );

    setStatus(
      'stConexion',
      conn.success && conn.coincide_con_registro_instalacion !== false ? 'ok' : (base.instalado ? 'warn' : 'pending'),
      conn.success ? ('Fuente: ' + (conn.fuente || 'IASYN_SPREADSHEET_ID')) : 'Pendiente de instalación'
    );

    setStatus(
      'stDrive',
      drive.root && drive.root.ok ? 'ok' : (base.instalado ? 'warn' : 'pending'),
      drive.root && drive.root.nombre ? drive.root.nombre : 'Raíz no verificada'
    );

    setStatus(
      'stDocumentos',
      drive.documentos_clinicos && drive.documentos_clinicos.ok ? 'ok' : (base.instalado ? 'warn' : 'pending'),
      drive.documentos_clinicos && drive.documentos_clinicos.nombre
        ? drive.documentos_clinicos.nombre
        : 'Carpeta no verificada'
    );

    setStatus(
      'stSeguridad',
      seguridad.hoja_usuarios_existe === true ? 'ok' : (base.instalado ? 'warn' : 'pending'),
      seguridad.total_usuarios !== undefined
        ? (seguridad.total_usuarios + ' usuario(s) registrado(s)')
        : 'Pendiente'
    );

    setStatus(
      'stFinal',
      data.completo === true ? 'ok' : (data.estado_setup === 'ERROR' ? 'bad' : 'warn'),
      data.completo === true ? 'Instalación técnica completa' : (data.estado_setup || 'Pendiente')
    );
  }

  function mostrarResultadoInstalacion(r) {
    const estado = (r && r.estado) || {};
    pintarEstado(estado);

    if (r && r.administrador_inicial && r.administrador_inicial.creado === true) {
      refs.credUsuario.textContent = r.administrador_inicial.usuario || 'admin';
      refs.credClave.textContent = r.administrador_inicial.clave_temporal || '';
      refs.credenciales.style.display = 'block';
    } else {
      refs.credenciales.style.display = 'none';
    }

    const url = texto(refs.webAppUrl.value);
    if (webAppValida(url) && r && r.success === true) {
      refs.lineaConfig.textContent =
        "const IASYN_INSTALLATION_WEB_APP_URL = '" + url.replace(/'/g, "\\'") + "';";
      refs.frontendPaso.style.display = 'block';
    }
  }

  async function verificar() {
    resetStatus();
    refs.credenciales.style.display = 'none';
    refs.frontendPaso.style.display = 'none';

    try {
      const url = endpoint();
      localStorage.setItem(STORAGE_WEBAPP, url);
      setStatus('stWebApp','ok','Endpoint /exec válido');
      setMensaje('Conectando con el Web App…');

      const estado = await apiGet('iasynInstaladorEstado');

      if (!estado || estado.success !== true) {
        throw new Error(estado && estado.message ? estado.message : 'No se pudo leer el estado del instalador.');
      }

      pintarEstado(estado);
      setMensaje(
        estado.completo
          ? 'IASYN ya está instalado y el diagnóstico técnico es correcto.'
          : 'Conexión correcta. Puede ejecutar la instalación.',
        estado.completo ? 'ok' : ''
      );
    } catch (error) {
      setStatus('stWebApp','bad','No se pudo validar el endpoint');
      setMensaje(error.message || String(error), 'bad');
    }
  }

  async function instalar() {
    resetStatus();
    refs.credenciales.style.display = 'none';
    refs.frontendPaso.style.display = 'none';

    const webApp = texto(refs.webAppUrl.value);
    const sheet = texto(refs.spreadsheetRef.value);
    const root = texto(refs.driveRootRef.value);

    if (!webAppValida(webApp)) {
      setStatus('stWebApp','bad','URL /exec inválida');
      setMensaje('Pegue la URL /exec del Web App propio de esta copia.', 'bad');
      refs.webAppUrl.focus();
      return;
    }

    if (!sheet) {
      setStatus('stSheet','bad','Falta URL o ID del Sheet');
      setMensaje('Pegue la URL o el ID del Google Sheet de esta instalación.', 'bad');
      refs.spreadsheetRef.focus();
      return;
    }

    setLoading(true);
    try {
      localStorage.setItem(STORAGE_WEBAPP, webApp);
      setStatus('stWebApp','ok','Endpoint /exec válido');
      setMensaje('IASYN está preparando la instalación. No cierre esta página…');

      const r = await apiPost('iasynInstaladorEjecutar', {
        version_cliente: VERSION,
        web_app_url: webApp,
        spreadsheet_ref: sheet,
        drive_root_ref: root,
        crear_drive_si_falta: true,
        crear_administrador_si_vacio: true
      });

      if (!r || r.success !== true) {
        throw new Error(r && r.message ? r.message : 'La instalación no pudo completarse.');
      }

      mostrarResultadoInstalacion(r);
      setMensaje(
        r.sin_cambios
          ? 'IASYN ya estaba instalado. No se realizaron cambios destructivos.'
          : 'IASYN quedó instalado correctamente. Revise el último paso del frontend.',
        'ok'
      );
    } catch (error) {
      setStatus('stFinal','bad','Instalación no completada');
      setMensaje(error.message || String(error), 'bad');
    } finally {
      setLoading(false);
    }
  }

  async function copiarTexto(textoCopiar) {
    const txt = texto(textoCopiar);
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
      setMensaje('Texto copiado al portapapeles.', 'ok');
    } catch (_e) {
      setMensaje('No fue posible copiar automáticamente. Seleccione y copie el texto manualmente.');
    }
  }

  refs.btnVerificar.addEventListener('click', verificar);
  refs.btnInstalar.addEventListener('click', instalar);
  refs.btnCopiarConfig.addEventListener('click', () => copiarTexto(refs.lineaConfig.textContent));

  document.querySelectorAll('[data-copy-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = $(btn.getAttribute('data-copy-target'));
      copiarTexto(target ? target.textContent : '');
    });
  });

  refs.btnIrLogin.addEventListener('click', function () {
    window.location.href = 'login.html';
  });

  refs.webAppUrl.addEventListener('input', function () {
    const ok = webAppValida(refs.webAppUrl.value);
    setStatus('stWebApp', ok ? 'ok' : 'pending', ok ? 'Endpoint /exec válido' : 'Endpoint propio /exec');
  });

  const guardado = texto(localStorage.getItem(STORAGE_WEBAPP));
  if (webAppValida(guardado)) {
    refs.webAppUrl.value = guardado;
    setStatus('stWebApp','ok','Endpoint /exec guardado en este navegador');
  }
})();
