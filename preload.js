'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('aio', {
  getLibrary: call('library:get'),
  scan: call('library:scan'),
  unhideAll: call('library:unhide'),
  launch: call('game:launch'),
  favorite: call('game:favorite'),
  removeGame: call('game:remove'),
  addGame: call('game:add'),
  updateGame: call('game:update'),
  pickExe: call('dialog:exe'),
  pickImage: call('dialog:image'),
  setCover: call('game:set-cover'),
  pathForFile: (f) => { try { return webUtils.getPathForFile(f); } catch { return ''; } },
  toggleFullscreen: call('win:fullscreen'),
  quit: call('app:quit'),
  ready: call('app:ready'),
  platformIcons: call('platforms:icons'),
  openIconsFolder: call('platforms:open-folder'),
  presence: call('presence:update'),
  presenceGet: call('presence:get'),
  presenceMode: call('presence:mode'),
  onPresenceState: (cb) => ipcRenderer.on('presence:state', (_e, p) => cb(p)),
  onQuitRequest: (cb) => ipcRenderer.on('app:quit-request', () => cb()),
  onCover: (cb) => ipcRenderer.on('cover', (_e, p) => cb(p)),
});
