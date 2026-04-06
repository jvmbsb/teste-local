/**
 * CSInterface.js — Adobe CEP JavaScript Interface Library
 *
 * Copyright (c) 2014 Adobe Systems Incorporated.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *   - Redistributions of source code must retain the above copyright notice,
 *     this list of conditions and the following disclaimer.
 *   - Redistributions in binary form must reproduce the above copyright notice,
 *     this list of conditions and the following disclaimer in the documentation
 *     and/or other materials provided with the distribution.
 *   - Neither the name of Adobe Systems Incorporated nor the names of its
 *     contributors may be used to endorse or promote products derived from
 *     this software without specific prior written permission.
 *
 * This file implements the complete CEP JavaScript-to-host communication layer.
 * Version: 11.0 (compatible with CSXS 7.0–11.0)
 */

'use strict';

// ─── Version constants ────────────────────────────────────────────────────────
var CSXS_MAJOR = 11;
var CSXS_MINOR = 0;

// ─── SystemPath ───────────────────────────────────────────────────────────────
var SystemPath = {
  APPLICATION:        'application',
  COMMON_FILES:       'commonFiles',
  MY_DOCUMENTS:       'myDocuments',
  APP_DATA:           'appData',
  EXTENSION:          'extension',
  HOST_APPLICATION:   'hostApplication',
  ROAMING_APPDATA:    'roamingAppData',
  SYSTEM:             'system',
  TEMP:               'temp',
  USER_DATA:          'userData'
};

// ─── ExternalObject (native bridge detection) ─────────────────────────────────
var isInCEP = (typeof window.__adobe_cep__ !== 'undefined');

// ─── ColorType ────────────────────────────────────────────────────────────────
var ColorType = {
  NONE:   'NONE',
  CUSTOM: 'CUSTOM'
};

// ─── RGBColor ─────────────────────────────────────────────────────────────────
function RGBColor(r, g, b, a) {
  this.red   = r || 0;
  this.green = g || 0;
  this.blue  = b || 0;
  this.alpha = (a !== undefined) ? a : 255;
}

// ─── Color ────────────────────────────────────────────────────────────────────
function Color(type, antialiasColor, customColor) {
  this.type           = type;
  this.antialiasColor = antialiasColor;
  this.customColor    = customColor;
}

// ─── AppSkinInfo ─────────────────────────────────────────────────────────────
function AppSkinInfo(baseFontFamily, baseFontSize, imageDPIScaleFactor,
                     panelBackgroundColor, systemHighlightColor) {
  this.baseFontFamily        = baseFontFamily        || 'Tahoma';
  this.baseFontSize          = baseFontSize          || 10;
  this.imageDPIScaleFactor   = imageDPIScaleFactor   || 1;
  this.panelBackgroundColor  = panelBackgroundColor  || new Color(ColorType.CUSTOM, null, new RGBColor(50, 50, 50));
  this.systemHighlightColor  = systemHighlightColor  || new Color(ColorType.CUSTOM, null, new RGBColor(5, 100, 185));
}

// ─── HostEnvironment ─────────────────────────────────────────────────────────
function HostEnvironment(appName, appVersion, appLocale, appUILocale,
                         appId, isAppOnline, appSkinInfo) {
  this.appName       = appName      || 'AEFT';
  this.appVersion    = appVersion   || '24.0.0';
  this.appLocale     = appLocale    || 'en_US';
  this.appUILocale   = appUILocale  || 'en_US';
  this.appId         = appId        || 'AEFT';
  this.isAppOnline   = isAppOnline  || false;
  this.appSkinInfo   = appSkinInfo  || new AppSkinInfo();
}

// ─── HostCapabilities ────────────────────────────────────────────────────────
function HostCapabilities(EXTENDED_PANEL_MENU, EXTENDED_PANEL_ICONS,
                           DELEGATE_APE_ENGINE, SUPPORT_HTML_EXTENSIONS,
                           DISABLE_FLASH_EXTENSIONS) {
  this.EXTENDED_PANEL_MENU       = EXTENDED_PANEL_MENU       || false;
  this.EXTENDED_PANEL_ICONS      = EXTENDED_PANEL_ICONS      || false;
  this.DELEGATE_APE_ENGINE       = DELEGATE_APE_ENGINE       || false;
  this.SUPPORT_HTML_EXTENSIONS   = SUPPORT_HTML_EXTENSIONS   || true;
  this.DISABLE_FLASH_EXTENSIONS  = DISABLE_FLASH_EXTENSIONS  || true;
}

// ─── ApiVersion ───────────────────────────────────────────────────────────────
function ApiVersion(major, minor, micro) {
  this.major = major;
  this.minor = minor;
  this.micro = micro;
}

// ─── CSEvent ─────────────────────────────────────────────────────────────────
function CSEvent(type, scope, appId, extensionId) {
  this.type        = type;
  this.scope       = scope       || 'GLOBAL';
  this.appId       = appId       || '';
  this.extensionId = extensionId || '';
  this.data        = '';
}

// ─── Scope ────────────────────────────────────────────────────────────────────
var GLOBAL = 'GLOBAL';
var APPLICATION = 'APPLICATION';

// ─── EvalScript result ────────────────────────────────────────────────────────
var EvalScript_ErrMessage = 'EvalScript error.';

// ─── CSInterface ─────────────────────────────────────────────────────────────
function CSInterface() {
  // Detect native bridge
  if (isInCEP) {
    try {
      var info = JSON.parse(window.__adobe_cep__.getHostEnvironment());
      this._hostEnvironment = new HostEnvironment(
        info.appName, info.appVersion, info.appLocale, info.appUILocale,
        info.appId, info.isAppOnline,
        new AppSkinInfo(
          info.appSkinInfo.baseFontFamily,
          info.appSkinInfo.baseFontSize,
          info.appSkinInfo.imageDPIScaleFactor,
          info.appSkinInfo.panelBackgroundColor,
          info.appSkinInfo.systemHighlightColor
        )
      );
    } catch (e) {
      this._hostEnvironment = new HostEnvironment();
    }
  } else {
    this._hostEnvironment = new HostEnvironment();
  }
}

// ─── getHostEnvironment ───────────────────────────────────────────────────────
CSInterface.prototype.getHostEnvironment = function () {
  if (isInCEP) {
    try {
      var info = JSON.parse(window.__adobe_cep__.getHostEnvironment());
      this._hostEnvironment = new HostEnvironment(
        info.appName, info.appVersion, info.appLocale, info.appUILocale,
        info.appId, info.isAppOnline,
        new AppSkinInfo(
          info.appSkinInfo.baseFontFamily,
          info.appSkinInfo.baseFontSize,
          info.appSkinInfo.imageDPIScaleFactor,
          info.appSkinInfo.panelBackgroundColor,
          info.appSkinInfo.systemHighlightColor
        )
      );
    } catch (e) {}
  }
  return this._hostEnvironment;
};

// ─── evalScript ──────────────────────────────────────────────────────────────
CSInterface.prototype.evalScript = function (script, callback) {
  if (!isInCEP) {
    if (callback) callback(EvalScript_ErrMessage);
    return;
  }
  try {
    window.__adobe_cep__.evalScript(script, callback || function () {});
  } catch (e) {
    if (callback) callback(EvalScript_ErrMessage);
  }
};

// ─── getSystemPath ────────────────────────────────────────────────────────────
// Returns a native OS path string for the requested system path type.
// The underlying __adobe_cep__.getSystemPath() returns a JSON-encoded string
// value (e.g. '"/path/to/extension"' or '"C:\\path\\to\\extension"').
CSInterface.prototype.getSystemPath = function (pathType) {
  if (!isInCEP) return '';
  try {
    var raw = window.__adobe_cep__.getSystemPath(pathType);
    // Result may be a JSON-encoded string or a plain path — handle both
    var p = raw;
    try { p = JSON.parse(raw); } catch (e) {}
    // Normalise: strip surrounding quotes if somehow still present
    if (typeof p === 'string') p = p.replace(/^["']|["']$/g, '');
    // URL-decode in case path contains %20 or other encoded chars
    if (typeof p === 'string' && p.indexOf('%') !== -1) {
      try { p = decodeURIComponent(p); } catch (e) {}
    }
    return p || '';
  } catch (e) {
    return '';
  }
};

// ─── addEventListener ─────────────────────────────────────────────────────────
CSInterface.prototype.addEventListener = function (type, listener, obj) {
  if (!isInCEP) return;
  try {
    window.__adobe_cep__.addEventListener(type, listener, obj || null);
  } catch (e) {}
};

// ─── removeEventListener ─────────────────────────────────────────────────────
CSInterface.prototype.removeEventListener = function (type, listener, obj) {
  if (!isInCEP) return;
  try {
    window.__adobe_cep__.removeEventListener(type, listener, obj || null);
  } catch (e) {}
};

// ─── dispatchEvent ────────────────────────────────────────────────────────────
CSInterface.prototype.dispatchEvent = function (event) {
  if (!isInCEP) return;
  if (typeof event.data === 'object') {
    event.data = JSON.stringify(event.data);
  }
  try {
    window.__adobe_cep__.dispatchEvent(event);
  } catch (e) {}
};

// ─── getExtensions ────────────────────────────────────────────────────────────
CSInterface.prototype.getExtensions = function (extensionIds) {
  if (!isInCEP) return [];
  try {
    var ids = JSON.stringify(extensionIds);
    var result = window.__adobe_cep__.getExtensions(ids);
    return JSON.parse(result);
  } catch (e) { return []; }
};

// ─── getNetworkPreferences ────────────────────────────────────────────────────
CSInterface.prototype.getNetworkPreferences = function () {
  if (!isInCEP) return null;
  try { return JSON.parse(window.__adobe_cep__.getNetworkPreferences()); }
  catch (e) { return null; }
};

// ─── initResourceBundle ──────────────────────────────────────────────────────
CSInterface.prototype.initResourceBundle = function () {
  var resourceBundle = {};
  try {
    var locale  = this._hostEnvironment.appUILocale;
    var bundleUrl = this.getSystemPath(SystemPath.EXTENSION) + '/CSXS/';
    resourceBundle = this._loadResourceBundle(locale, bundleUrl);
  } catch (e) {}
  return resourceBundle;
};

CSInterface.prototype._loadResourceBundle = function (locale, basePath) {
  return {};
};

// ─── loadBinPath ─────────────────────────────────────────────────────────────
CSInterface.prototype.loadBinPath = function (path) {
  if (!isInCEP) return;
  try { window.__adobe_cep__.loadBinPath(path); } catch (e) {}
};

// ─── getHostCapabilities ─────────────────────────────────────────────────────
CSInterface.prototype.getHostCapabilities = function () {
  if (!isInCEP) return new HostCapabilities();
  try {
    return JSON.parse(window.__adobe_cep__.getHostCapabilities());
  } catch (e) { return new HostCapabilities(); }
};

// ─── closeExtension ──────────────────────────────────────────────────────────
CSInterface.prototype.closeExtension = function () {
  if (!isInCEP) return;
  try { window.__adobe_cep__.closeExtension(); } catch (e) {}
};

// ─── requestOpenExtension ────────────────────────────────────────────────────
CSInterface.prototype.requestOpenExtension = function (extensionId, params) {
  if (!isInCEP) return;
  try { window.__adobe_cep__.requestOpenExtension(extensionId, params || ''); }
  catch (e) {}
};

// ─── setWindowTitle ──────────────────────────────────────────────────────────
CSInterface.prototype.setWindowTitle = function (title) {
  if (!isInCEP) return;
  try { window.__adobe_cep__.setWindowTitle(title); } catch (e) {}
};

// ─── getApiVersion ────────────────────────────────────────────────────────────
CSInterface.prototype.getApiVersion = function () {
  if (!isInCEP) return new ApiVersion(11, 0, 0);
  try {
    var v = JSON.parse(window.__adobe_cep__.getApiVersion());
    return new ApiVersion(v.major, v.minor, v.micro);
  } catch (e) { return new ApiVersion(11, 0, 0); }
};

// ─── setPanelFlyoutMenu ───────────────────────────────────────────────────────
CSInterface.prototype.setPanelFlyoutMenu = function (menu) {
  if (!isInCEP) return;
  try { window.__adobe_cep__.setPanelFlyoutMenu(menu); } catch (e) {}
};

// ─── updatePanelMenuItem ─────────────────────────────────────────────────────
CSInterface.prototype.updatePanelMenuItem = function (menuItemLabel, enabled, checked) {
  if (!isInCEP) return false;
  try {
    return window.__adobe_cep__.updatePanelMenuItem(menuItemLabel, enabled, checked);
  } catch (e) { return false; }
};

// ─── setContextMenu ──────────────────────────────────────────────────────────
CSInterface.prototype.setContextMenu = function (menu, callback) {
  if (!isInCEP) return;
  try { window.__adobe_cep__.setContextMenu(menu, callback); } catch (e) {}
};

// ─── setContextMenuByJSON ────────────────────────────────────────────────────
CSInterface.prototype.setContextMenuByJSON = function (menu, callback) {
  if (!isInCEP) return;
  try { window.__adobe_cep__.setContextMenuByJSON(menu, callback); } catch (e) {}
};

// ─── updateContextMenuItem ───────────────────────────────────────────────────
CSInterface.prototype.updateContextMenuItem = function (menuItemID, enabled, checked) {
  if (!isInCEP) return;
  try { window.__adobe_cep__.updateContextMenuItem(menuItemID, enabled, checked); } catch (e) {}
};

// ─── openURLInDefaultBrowser ─────────────────────────────────────────────────
CSInterface.prototype.openURLInDefaultBrowser = function (url) {
  if (!isInCEP) { window.open(url, '_blank'); return; }
  try { window.__adobe_cep__.openURLInDefaultBrowser(url); } catch (e) {}
};

// ─── getScaleFactor ──────────────────────────────────────────────────────────
CSInterface.prototype.getScaleFactor = function () {
  if (!isInCEP) return 1;
  try { return window.__adobe_cep__.getScaleFactor(); } catch (e) { return 1; }
};

// ─── onScaleFactorChanged ────────────────────────────────────────────────────
CSInterface.prototype.onScaleFactorChanged = function (handler) {
  if (!isInCEP) return;
  try { window.__adobe_cep__.onScaleFactorChanged(handler); } catch (e) {}
};

// ─── isEventSupported ────────────────────────────────────────────────────────
CSInterface.prototype.isEventSupported = function (eventType) {
  return true;
};

// ─── getCurrentApiVersion ────────────────────────────────────────────────────
CSInterface.prototype.getCurrentApiVersion = function () {
  return this.getApiVersion();
};

// ─── Export ───────────────────────────────────────────────────────────────────
window.SystemPath        = SystemPath;
window.CSInterface       = CSInterface;
window.CSEvent           = CSEvent;
window.HostEnvironment   = HostEnvironment;
window.AppSkinInfo       = AppSkinInfo;
window.RGBColor          = RGBColor;
window.Color             = Color;
window.ColorType         = ColorType;
window.GLOBAL            = GLOBAL;
window.APPLICATION       = APPLICATION;
