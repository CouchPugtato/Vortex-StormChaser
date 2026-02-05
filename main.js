const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let currentProjectPath = null;
const GLOBAL_SETTINGS_FILE = path.join(__dirname, 'settings.json');

function getSettingsPath() {
    if (currentProjectPath) {
        return path.join(currentProjectPath, 'settings.json');
    }
    return GLOBAL_SETTINGS_FILE;
}

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 900,
        backgroundColor: '#000000',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    const menuTemplate = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Project...',
                    click: async () => {
                        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openDirectory', 'createDirectory']
                        });
                        if (!canceled && filePaths.length > 0) {
                            const selectedPath = filePaths[0];
                            try {
                                const projectPath = path.join(selectedPath, 'vortex');
                                if (!fs.existsSync(projectPath)) fs.mkdirSync(projectPath);

                                
                                const eventsPath = path.join(projectPath, 'events.json');
                                const settingsPath = path.join(projectPath, 'settings.json');
                                const imagesDir = path.join(projectPath, 'field_images');
                                const routinesDir = path.join(projectPath, 'vortex routines');

                                if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir);
                                if (!fs.existsSync(routinesDir)) fs.mkdirSync(routinesDir);

                                const defaultEvents = ["Intake", "Shoot", "Stop", "Balance"];
                                if (!fs.existsSync(eventsPath)) {
                                    fs.writeFileSync(eventsPath, JSON.stringify(defaultEvents, null, 4));
                                }

                                
                                if (!fs.existsSync(settingsPath)) {
                                    
                                    let initialSettings = {};
                                    if (fs.existsSync(GLOBAL_SETTINGS_FILE)) {
                                        initialSettings = JSON.parse(fs.readFileSync(GLOBAL_SETTINGS_FILE));
                                    }
                                    fs.writeFileSync(settingsPath, JSON.stringify(initialSettings, null, 4));
                                }

                                currentProjectPath = projectPath;
                                
                                
                                const eventsData = JSON.parse(fs.readFileSync(eventsPath, 'utf-8'));
                                const settingsData = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

                                mainWindow.webContents.send('project:loaded', {
                                    events: eventsData,
                                    settings: settingsData,
                                    path: projectPath
                                });

                            } catch (e) {
                                console.error('Failed to create new project:', e);
                                dialog.showErrorBox('Error', 'Failed to create new project: ' + e.message);
                            }
                        }
                    }
                },
                {
                    label: 'Open Project...',
                    click: async () => {
                        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openDirectory']
                        });
                        if (!canceled && filePaths.length > 0) {
                            const selectedPath = filePaths[0];
                            try {
                                const projectPath = path.join(selectedPath, 'vortex');
                                
                                if (!fs.existsSync(projectPath)) {
                                    dialog.showErrorBox('Invalid Project', 'The selected folder does not contain a "vortex" folder.');
                                    return;
                                }

                                const eventsPath = path.join(projectPath, 'events.json');
                                const settingsPath = path.join(projectPath, 'settings.json');
                                
                                if (!fs.existsSync(eventsPath) || !fs.existsSync(settingsPath)) {
                                    dialog.showErrorBox('Invalid Project', 'The "vortex" folder does not contain a valid project (missing events.json or settings.json).');
                                    return;
                                }

                                currentProjectPath = projectPath;
                                
                                const eventsData = JSON.parse(fs.readFileSync(eventsPath, 'utf-8'));
                                const settingsData = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

                                mainWindow.webContents.send('project:loaded', {
                                    events: eventsData,
                                    settings: settingsData,
                                    path: projectPath
                                });

                            } catch (e) {
                                console.error('Failed to open project:', e);
                                dialog.showErrorBox('Error', 'Failed to open project: ' + e.message);
                            }
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Open Field Image...',
          click: async () => {
             const defaultPath = currentProjectPath ? path.join(currentProjectPath, 'field_images') : undefined;
             const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
                defaultPath: defaultPath,
                properties: ['openFile'],
                filters: [{ name: 'Images', extensions: ['jpg', 'png', 'gif', 'bmp', 'jpeg'] }]
             });
             if (!canceled && filePaths.length > 0) {
                 mainWindow.webContents.send('menu:open-image', filePaths[0]);
             }
          }
        },
        {
          label: 'Export Path...',
          click: () => mainWindow.webContents.send('menu:export-path')
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
        label: 'Settings',
        submenu: [
            {
                label: 'Toggle Crop Controls',
                click: () => mainWindow.webContents.send('menu:toggle-crop')
            },
            {
                label: 'Toggle Robot Settings',
                click: () => mainWindow.webContents.send('menu:toggle-robot')
            }
        ]
    },
    {
        label: 'Edit',
        submenu: [
            {
                label: 'Clear All Points',
                click: () => mainWindow.webContents.send('menu:clear-points')
            }
        ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:openFile', async () => {
  const defaultPath = currentProjectPath ? path.join(currentProjectPath, 'field_images') : undefined;
  const { canceled, filePaths } = await dialog.showOpenDialog({
    defaultPath: defaultPath,
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'png', 'gif', 'bmp', 'jpeg'] }]
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

ipcMain.handle('dialog:saveFile', async (event, content) => {
  const defaultPath = currentProjectPath ? path.join(currentProjectPath, 'vortex routines', 'points.json') : 'points.json';
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'JSON', extensions: ['json'] }],
    defaultPath: defaultPath
  });
  
  if (canceled) return false;
  
  try {
    fs.writeFileSync(filePath, content);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
});

ipcMain.handle('app:getDefaultImage', () => {
  if (currentProjectPath) {
      
      const imagesDir = path.join(currentProjectPath, 'field_images');
      if (fs.existsSync(imagesDir)) {
          const files = fs.readdirSync(imagesDir);
          const imageFile = files.find(file => /\.(jpg|png|gif|bmp|jpeg)$/i.test(file));
          if (imageFile) {
              return path.join(imagesDir, imageFile);
          }
      }
  }
  const defaultPath = path.join(__dirname, 'field_images', '2026.png');
  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }
  return null;
});

ipcMain.handle('settings:load', async () => {
    try {
        const settingsPath = getSettingsPath();
        if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
    return null;
});

ipcMain.handle('settings:save', async (event, settings) => {
    try {
        const settingsPath = getSettingsPath();
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
        return true;
    } catch (error) {
        console.error('Failed to save settings:', error);
        return false;
    }
});


ipcMain.handle('routines:list', async () => {
    if (!currentProjectPath) return [];
    try {
        const routinesDir = path.join(currentProjectPath, 'vortex routines');
        if (fs.existsSync(routinesDir)) {
            const files = fs.readdirSync(routinesDir);
            return files.filter(file => file.endsWith('.json'));
        }
    } catch (e) {
        console.error('Failed to list routines:', e);
    }
    return [];
});

ipcMain.handle('routines:save', async (event, filename, content) => {
    if (!currentProjectPath) return false;
    try {
        const routinesDir = path.join(currentProjectPath, 'vortex routines');
        if (!fs.existsSync(routinesDir)) fs.mkdirSync(routinesDir);
        
        const filePath = path.join(routinesDir, filename);
        fs.writeFileSync(filePath, content);
        return true;
    } catch (e) {
        console.error('Failed to save routine:', e);
        return false;
    }
});

ipcMain.handle('routines:load', async (event, filename) => {
    if (!currentProjectPath) return null;
    try {
        const filePath = path.join(currentProjectPath, 'vortex routines', filename);
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Failed to load routine:', e);
    }
    return null;
});
