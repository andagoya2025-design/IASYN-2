/**
 * IASYN CLINICAL ERP
 * Archivo: instalacion.js
 * Módulo: Instalador técnico independiente
 * Versión: 1.1.0
 *
 * REGLAS
 * - NO depende de iasyn-config.js para poder arrancar una copia nueva.
 * - NO modifica identidad del centro, usuarios normales, finanzas ni clínica.
 * - El Web App se pega una sola vez en esta pantalla para bootstrap.
 * - Después de instalar, muestra la línea exacta que debe quedar en iasyn-config.js.
 *
 * BLINDAJE V1.1.0
 * - Confirmación explícita antes de la primera instalación.
 * - Verificación de estado inmediatamente antes del POST de instalación.
 * - Si el backend reporta instalación COMPLETA, NO vuelve a ejecutar instalación.
 * - El botón Instalar queda deshabilitado en modo diagnóstico.
 * - Protección contra doble clic / ejecución concurrente desde esta interfaz.
 *
 * IMPORTANTE
 * - Esta capa protege la interfaz y reduce reinstalaciones accidentales.
 * - La autorización criptográfica/bootstrap del endpoint pertenece al backend
 *   y debe implementarse en un bloque separado, sin inventar contratos aquí.
 */
(function () {
  'use strict';

  const VERSION = '1.1.0';
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
    btnIrLogin: $('btnIrLogin'),

    proteccionInstalacion: $('proteccionInstalacion'),
    modoInstalacion: $('modoInstalacion'),

    modalConfirmacion: $('modalConfirmacion'),
    confirmSheet: $('confirmSheet'),
    confirmWebApp: $('confirmWebApp'),
    btnCancelarInstalacion: $('btnCancelarInstalacion'),
    btnConfirmarInstalacion: $('btnConfirmarInstalacion')
  };

  const statusIds = [
    'stWebApp','stSheet','stConexion','stDrive',
    'stDocumentos','stSeguridad','stFinal'
  ];

  let instalacionCompleta = false;
  let operacionEnCurso = false;
  let resolverConfirmacion = null;

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

  function spreadsheetRefPareceValida(valor) {
    const ref = texto(valor);
    if (!ref) return false;

    if (/^[a-zA-Z0-9_-]{20,}$/.test(ref)) return true;

    try {
      const u = new URL(ref);
      if (u.protocol !== 'https:') return false;
      if (!['docs.google.com', 'drive.google.com'].includes(u.hostname)) return false;
      return /\/spreadsheets\/d\/[a-zA-Z0-9_-]{20,}/.test(u.pathname) ||
        /[?&]id=[a-zA-Z0-9_-]{20,}/.test(u.search);
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

  function setModoInstalacion(completo) {
    instalacionCompleta = completo === true;

    if (refs.modoInstalacion) {
      refs.modoInstalacion.textContent = instalacionCompleta
        ? 'Modo diagnóstico · instalación completa'
        : 'Modo instalación · pendiente de completar';

      refs.modoInstalacion.classList.toggle('ok', instalacionCompleta);
      refs.modoInstalacion.classList.toggle('warn', !instalacionCompleta);
    }

    if (refs.proteccionInstalacion) {
      refs.proteccionInstalacion.classList.toggle('ok', instalacionCompleta);
      refs.proteccionInstalacion.classList.toggle('warn', !instalacionCompleta);
      refs.proteccionInstalacion.textContent = instalacionCompleta
        ? 'La instalación ya está completa. El botón de instalación queda bloqueado; utilice “Verificar conexión” para diagnóstico.'
        : 'Antes de instalar, IASYN verificará nuevamente el estado y pedirá confirmación explícita. Una instalación ya completa no se volverá a ejecutar desde esta pantalla.';
    }

    const t = refs.btnInstalar.querySelector('.btn-text');
    if (t && !operacionEnCurso) {
      t.textContent = instalacionCompleta ? 'Instalación completa' : 'Instalar IASYN';
    }

    refs.btnInstalar.disabled = operacionEnCurso || instalacionCompleta;
  }

  function setLoading(cargando) {
    operacionEnCurso = Boolean(cargando);
    refs.btnInstalar.disabled = operacionEnCurso || instalacionCompleta;
    refs.btnVerificar.disabled = operacionEnCurso;
    refs.btnInstalar.classList.toggle('loading', operacionEnCurso);

    const t = refs.btnInstalar.querySelector('.btn-text');
    if (t) {
      t.textContent = operacionEnCurso
        ? 'Instalando…'
        : (instalacionCompleta ? 'Instalación completa' : 'Instalar IASYN');
    }
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
      conn.success && conn.coincide_con_registro_instalacion !== false
        ? 'ok'
        : (base.instalado ? 'warn' : 'pending'),
      conn.success
        ? ('Fuente: ' + (conn.fuente || 'IASYN_SPREADSHEET_ID'))
        : 'Pendiente de instalación'
    );

    setStatus(
      'stDrive',
      drive.root && drive.root.ok ? 'ok' : (base.instalado ? 'warn' : 'pending'),
      drive.root && drive.root.nombre ? drive.root.nombre : 'Raíz no verificada'
    );

    setStatus(
      'stDocumentos',
      drive.documentos_clinicos && drive.documentos_clinicos.ok
        ? 'ok'
        : (base.instalado ? 'warn' : 'pending'),
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
      data.completo === true
        ? 'Instalación técnica completa'
        : (data.estado_setup || 'Pendiente')
    );

    setModoInstalacion(data.completo === true);
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
    if (webAppValida(url) && r && r.success === true && r.sin_cambios !== true) {
      refs.lineaConfig.textContent =
        "const IASYN_INSTALLATION_WEB_APP_URL = '" +
        url.replace(/'/g, "\\'") +
        "';";
      refs.frontendPaso.style.display = 'block';
    }
  }

  function cerrarConfirmacion(valor) {
    if (!refs.modalConfirmacion) return;

    refs.modalConfirmacion.classList.remove('show');
    refs.modalConfirmacion.setAttribute('aria-hidden', 'true');

    const resolver = resolverConfirmacion;
    resolverConfirmacion = null;

    if (resolver) resolver(Boolean(valor));
  }

  function solicitarConfirmacionInstalacion() {
    if (!refs.modalConfirmacion) {
      return Promise.resolve(
        window.confirm(
          '¿Desea instalar IASYN en esta base?\n\n' +
          'Esta operación preparará la infraestructura.\n' +
          'No elimina datos clínicos.'
        )
      );
    }

    refs.confirmSheet.textContent = texto(refs.spreadsheetRef.value) || '—';
    refs.confirmWebApp.textContent = texto(refs.webAppUrl.value) || '—';

    refs.modalConfirmacion.classList.add('show');
    refs.modalConfirmacion.setAttribute('aria-hidden', 'false');

    return new Promise(resolve => {
      resolverConfirmacion = resolve;
      setTimeout(() => refs.btnConfirmarInstalacion.focus(), 0);
    });
  }

  async function verificarEstadoActual() {
    const estado = await apiGet('iasynInstaladorEstado');

    if (!estado || estado.success !== true) {
      throw new Error(
        estado && estado.message
          ? estado.message
          : 'No se pudo leer el estado del instalador.'
      );
    }

    pintarEstado(estado);
    return estado;
  }

  async function verificar() {
    if (operacionEnCurso) return;

    resetStatus();
    refs.credenciales.style.display = 'none';
    refs.frontendPaso.style.display = 'none';

    try {
      const url = endpoint();
      localStorage.setItem(STORAGE_WEBAPP, url);
      setStatus('stWebApp','ok','Endpoint /exec válido');
      setMensaje('Conectando con el Web App…');

      const estado = await verificarEstadoActual();

      setMensaje(
        estado.completo
          ? 'IASYN ya está instalado. La pantalla quedó en modo diagnóstico y no permitirá reinstalar accidentalmente.'
          : 'Conexión correcta. Puede ejecutar la instalación cuando haya confirmado que este Sheet y este Web App pertenecen a la misma copia.',
        estado.completo ? 'ok' : ''
      );
    } catch (error) {
      setModoInstalacion(false);
      setStatus('stWebApp','bad','No se pudo validar el endpoint');
      setMensaje(error.message || String(error), 'bad');
    }
  }

  async function instalar() {
    if (operacionEnCurso) return;

    if (instalacionCompleta) {
      setMensaje(
        'IASYN ya está instalado. Utilice “Verificar conexión” para diagnóstico; no se ejecutó ninguna reinstalación.',
        'ok'
      );
      return;
    }

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

    if (!spreadsheetRefPareceValida(sheet)) {
      setStatus('stSheet','bad','Referencia del Sheet inválida');
      setMensaje(
        'La referencia del Google Sheet no parece válida. Pegue la URL completa de Sheets o su ID.',
        'bad'
      );
      refs.spreadsheetRef.focus();
      return;
    }

    let confirmado = false;
    try {
      confirmado = await solicitarConfirmacionInstalacion();
    } catch (_e) {
      confirmado = false;
    }

    if (!confirmado) {
      setMensaje('Instalación cancelada. No se realizaron cambios.');
      return;
    }

    setLoading(true);

    try {
      localStorage.setItem(STORAGE_WEBAPP, webApp);
      setStatus('stWebApp','ok','Endpoint /exec válido');

      /*
       * BLINDAJE ANTIRREINSTALACIÓN:
       * antes de cualquier POST se vuelve a consultar el backend.
       * Si ya está COMPLETO, la interfaz se detiene sin ejecutar instalación.
       */
      setMensaje('Verificando que esta instalación no esté ya completa…');
      const preflight = await verificarEstadoActual();

      if (preflight.completo === true) {
        refs.frontendPaso.style.display = 'none';
        refs.credenciales.style.display = 'none';
        setMensaje(
          'IASYN ya estaba instalado. No se envió ninguna orden de reinstalación.',
          'ok'
        );
        return;
      }

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
        throw new Error(
          r && r.message
            ? r.message
            : 'La instalación no pudo completarse.'
        );
      }

      mostrarResultadoInstalacion(r);

      setMensaje(
        r.sin_cambios
          ? 'IASYN ya estaba instalado. El backend confirmó que no se realizaron cambios destructivos.'
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
      setMensaje(
        'No fue posible copiar automáticamente. Seleccione y copie el texto manualmente.'
      );
    }
  }

  refs.btnVerificar.addEventListener('click', verificar);
  refs.btnInstalar.addEventListener('click', instalar);
  refs.btnCopiarConfig.addEventListener(
    'click',
    () => copiarTexto(refs.lineaConfig.textContent)
  );

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
    if (instalacionCompleta) {
      setModoInstalacion(false);
      setStatus(
        'stFinal',
        'warn',
        'Endpoint cambiado localmente: vuelva a verificar antes de cualquier instalación.'
      );
    }

    const ok = webAppValida(refs.webAppUrl.value);
    setStatus(
      'stWebApp',
      ok ? 'ok' : 'pending',
      ok ? 'Endpoint /exec válido' : 'Endpoint propio /exec'
    );
  });

  refs.spreadsheetRef.addEventListener('input', function () {
    if (instalacionCompleta) {
      setModoInstalacion(false);
      setStatus(
        'stFinal',
        'warn',
        'Sheet cambiado localmente: vuelva a verificar antes de cualquier instalación.'
      );
    }
  });

  if (refs.btnCancelarInstalacion) {
    refs.btnCancelarInstalacion.addEventListener(
      'click',
      () => cerrarConfirmacion(false)
    );
  }

  if (refs.btnConfirmarInstalacion) {
    refs.btnConfirmarInstalacion.addEventListener(
      'click',
      () => cerrarConfirmacion(true)
    );
  }

  if (refs.modalConfirmacion) {
    refs.modalConfirmacion.addEventListener('click', function (event) {
      if (event.target === refs.modalConfirmacion) {
        cerrarConfirmacion(false);
      }
    });
  }

  document.addEventListener('keydown', function (event) {
    if (
      event.key === 'Escape' &&
      refs.modalConfirmacion &&
      refs.modalConfirmacion.classList.contains('show')
    ) {
      cerrarConfirmacion(false);
    }
  });

  setModoInstalacion(false);

  const guardado = texto(localStorage.getItem(STORAGE_WEBAPP));
  if (webAppValida(guardado)) {
    refs.webAppUrl.value = guardado;
    setStatus('stWebApp','ok','Endpoint /exec guardado en este navegador');

    /*
     * Recarga como diagnóstico:
     * es SOLO LECTURA y únicamente se ejecuta cuando existe un /exec válido
     * guardado previamente por el propio instalador.
     */
    setTimeout(() => {
      verificar();
    }, 0);
  }
})();
