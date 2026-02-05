const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content) => ipcRenderer.invoke('dialog:saveFile', content),
  getDefaultImage: () => ipcRenderer.invoke('app:getDefaultImage'),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  onMenuCommand: (callback) => {
      ipcRenderer.on('menu:open-image', (e, path) => callback('open-image', path));
      ipcRenderer.on('menu:export-path', () => callback('export-path'));
      ipcRenderer.on('menu:toggle-crop', () => callback('toggle-crop'));
      ipcRenderer.on('menu:toggle-robot', () => callback('toggle-robot'));
      ipcRenderer.on('menu:clear-points', () => callback('clear-points'));
  }
});
