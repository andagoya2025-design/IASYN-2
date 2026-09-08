/**
 * ============================================================
 * IASYN CLINICAL ERP
 * Archivo: iasyn-config.js
 * ETAPA 3B — BLINDAJE DE INSTALACIÓN / ENDPOINT ÚNICO
 * Versión: 1.1.0
 * ============================================================
 *
 * OBJETIVO
 * - Mantener UN SOLO punto de configuración del Web App por instalación.
 * - Impedir que un clon sin configurar se conecte por accidente a otra
 *   instalación, a un endpoint histórico o a una URL relativa del hosting.
 * - Mostrar un aviso visible de "instalación no configurada" cuando falte
 *   la URL /exec propia del clon.
 *
 * INSTALACIÓN NUEVA / CLON
 * - Editar SOLAMENTE IASYN_INSTALLATION_WEB_APP_URL.
 * - Pegar la URL /exec del Web App de ESTA instalación.
 * - No añadir endpoints en index.html, seguridad.js, secretaria.html,
 *   configuracion.html, formulariocitas.html, apoyoIA.html ni
 *   asistente_comercial.html.
 *
 * BLINDAJE ANTIRREGRESIVO
 * - NO existe fallback a endpoints de otra instalación.
 * - Si la URL está vacía o no es una URL /exec válida de Apps Script,
 *   apiUrl/publicApiUrl/appScriptUrl reciben un esquema local bloqueado
 *   que fetch() no puede transportar por HTTP(S).
 * - El bloqueo evita caer en rutas relativas del hosting y evita reutilizar
 *   silenciosamente un endpoint previo.
 *
 * NO MODIFICA
 * - Lógica clínica, permisos, sesiones, payloads, acciones, storage keys,
 *   Drive, Sheets, Apps Script, eventos ni módulos clínicos.
 * ============================================================
 */
(function (global) {
  'use strict';

  /* ==========================================================
   * ÚNICA LÍNEA A CONFIGURAR EN CADA CLON
   * Ejemplo:
   * const IASYN_INSTALLATION_WEB_APP_URL =
   *   'https://script.google.com/macros/s/XXXXXXXX/exec';
   * ========================================================== */
  const IASYN_INSTALLATION_WEB_APP_URL =
    'https://script.google.com/macros/s/AKfycbz-Pc74aqgzRU95wyMzLw3UWj4OJtobRLhVfesWgT-WEbOX-JfLmzNpUPZKdNpVJnx8Ng/exec';

  /* Sentinel local. No es una URL HTTP(S) y nunca apunta a una base real. */
  const IASYN_ENDPOINT_BLOQUEADO =
    'iasyn-unconfigured://installation-required';

  function normalizarUrl_(valor) {
    return String(valor == null ? '' : valor).trim();
  }

  function esWebAppAppsScriptValida_(valor) {
    const texto = normalizarUrl_(valor);
    if (!texto) return false;

    try {
      const url = new URL(texto);
      if (url.protocol !== 'https:') return false;
      if (url.hostname !== 'script.google.com') return false;
      return /^\/macros\/s\/[^/]+\/exec\/?$/.test(url.pathname);
    } catch (_error) {
      return false;
    }
  }

  const installationUrl = normalizarUrl_(IASYN_INSTALLATION_WEB_APP_URL);
  const installationConfigured = esWebAppAppsScriptValida_(installationUrl);
  const installationStatus = installationConfigured
    ? 'CONFIGURADA'
    : (installationUrl ? 'URL_INVALIDA' : 'NO_CONFIGURADA');

  const connectionUrl = installationConfigured
    ? installationUrl
    : IASYN_ENDPOINT_BLOQUEADO;

  function mensajeInstalacion_() {
    if (installationStatus === 'URL_INVALIDA') {
      return 'IASYN no puede iniciar: la URL del Web App configurada no es válida. ' +
        'Revise IASYN_INSTALLATION_WEB_APP_URL en iasyn-config.js y use la URL /exec ' +
        'del Web App propio de esta instalación.';
    }

    return 'IASYN no puede iniciar: esta copia todavía no tiene configurado su Web App. ' +
      'Configure IASYN_INSTALLATION_WEB_APP_URL en iasyn-config.js con la URL /exec ' +
      'propia de esta instalación.';
  }

  function mostrarBloqueoInstalacion_() {
    if (installationConfigured || !global.document) return;

    const document = global.document;
    const id = 'iasyn-installation-blocker';
    if (document.getElementById(id)) return;

    const render = function () {
      if (document.getElementById(id)) return;

      const overlay = document.createElement('div');
      overlay.id = id;
      overlay.setAttribute('role', 'alert');
      overlay.setAttribute('aria-live', 'assertive');
      overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:2147483647',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'padding:24px',
        'background:rgba(248,250,252,.98)',
        'font-family:Arial,sans-serif',
        'color:#111827',
        'text-align:center'
      ].join(';');

      const panel = document.createElement('div');
      panel.style.cssText = [
        'max-width:680px',
        'padding:28px',
        'border:1px solid #cbd5e1',
        'border-radius:14px',
        'background:#ffffff',
        'box-shadow:0 12px 36px rgba(15,23,42,.12)'
      ].join(';');

      const titulo = document.createElement('div');
      titulo.textContent = 'IASYN — Instalación no configurada';
      titulo.style.cssText = 'font-size:22px;font-weight:700;margin-bottom:12px';

      const mensaje = document.createElement('div');
      mensaje.textContent = mensajeInstalacion_();
      mensaje.style.cssText = 'font-size:15px;line-height:1.55';

      panel.appendChild(titulo);
      panel.appendChild(mensaje);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
    };

    if (document.body) {
      render();
    } else {
      document.addEventListener('DOMContentLoaded', render, { once: true });
    }
  }

  global.IASYN_CONFIG = Object.freeze({
    version: '1.1.0',
    installationConfigured: installationConfigured,
    installationStatus: installationStatus,
    connectionBlocked: !installationConfigured,
    installationWebAppUrl: installationConfigured ? installationUrl : '',
    apiUrl: connectionUrl,
    publicApiUrl: connectionUrl,
    appScriptUrl: connectionUrl,
    blockedEndpoint: IASYN_ENDPOINT_BLOQUEADO,
    installationMessage: mensajeInstalacion_()
  });

  mostrarBloqueoInstalacion_();
})(window);
