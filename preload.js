const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content) => ipcRenderer.invoke('dialog:saveFile', content),
  getDefaultImage: () => ipcRenderer.invoke('app:getDefaultImage'),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  
  
  listRoutines: () => ipcRenderer.invoke('routines:list'),
  saveRoutine: (filename, content, imageBase64) => ipcRenderer.invoke('routines:save', filename, content, imageBase64),
  loadRoutine: (filename) => ipcRenderer.invoke('routines:load', filename),
  deleteRoutine: (filename) => ipcRenderer.invoke('routines:delete', filename),

  getRecentProjects: () => ipcRenderer.invoke('projects:getRecent'),
  openProject: (path) => ipcRenderer.invoke('projects:open', path),
  createProject: () => ipcRenderer.invoke('projects:create'),

  onMenuCommand: (callback) => {
      ipcRenderer.on('menu:open-image', (e, path) => callback('open-image', path));
      ipcRenderer.on('menu:open-path', () => callback('open-path'));
      ipcRenderer.on('menu:export-path', () => callback('export-path'));
      ipcRenderer.on('menu:toggle-crop', () => callback('toggle-crop'));
      ipcRenderer.on('menu:toggle-robot', () => callback('toggle-robot'));
      ipcRenderer.on('menu:clear-points', () => callback('clear-points'));
      ipcRenderer.on('menu:load-events-config', (e, data) => callback('load-events-config', data));
      ipcRenderer.on('project:loaded', (e, data) => callback('project-loaded', data));
  }
});
