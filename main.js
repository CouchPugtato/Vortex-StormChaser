const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let currentProjectPath = null;
const GLOBAL_SETTINGS_FILE = path.join(__dirname, 'settings.json');
const RECENT_PROJECTS_FILE = path.join(app.getPath('userData'), 'recent_projects.json');

function getSettingsPath() {
    if (currentProjectPath) {
        return path.join(currentProjectPath, 'settings.json');
    }
    return GLOBAL_SETTINGS_FILE;
}

function getRecentProjects() {
    try {
        if (fs.existsSync(RECENT_PROJECTS_FILE)) {
            return JSON.parse(fs.readFileSync(RECENT_PROJECTS_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error('Failed to load recent projects:', e);
    }
    return [];
}

function addToRecentProjects(projectPath) {
    let recent = getRecentProjects();
    recent = recent.filter(p => p !== projectPath);
    recent.unshift(projectPath);
    if (recent.length > 10) recent = recent.slice(0, 10);
    
    try {
        fs.writeFileSync(RECENT_PROJECTS_FILE, JSON.stringify(recent, null, 4));
    } catch (e) {
        console.error('Failed to save recent projects:', e);
    }
}

async function openProject(mainWindow, projectPath) {
    try {
        if (!fs.existsSync(projectPath)) {
            let recent = getRecentProjects();
            if (recent.includes(projectPath)) {
                recent = recent.filter(p => p !== projectPath);
                fs.writeFileSync(RECENT_PROJECTS_FILE, JSON.stringify(recent, null, 4));
            }
            throw new Error('Project directory not found.');
        }

        const eventsPath = path.join(projectPath, 'events.json');
        const settingsPath = path.join(projectPath, 'settings.json');
        
        if (!fs.existsSync(eventsPath) || !fs.existsSync(settingsPath)) {
             throw new Error('The "vortex" folder does not contain a valid project (missing events.json or settings.json).');
        }

        currentProjectPath = projectPath;
        addToRecentProjects(projectPath);
        
        const eventsData = JSON.parse(fs.readFileSync(eventsPath, 'utf-8'));
        const settingsData = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

        mainWindow.webContents.send('project:loaded', {
            events: eventsData,
            settings: settingsData,
            path: projectPath
        });
        return true;
    } catch (e) {
        console.error('Failed to open project:', e);
        dialog.showErrorBox('Error', 'Failed to open project: ' + e.message);
        return false;
    }
}

async function handleCreateProject(mainWindow) {
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

            await openProject(mainWindow, projectPath);

        } catch (e) {
            console.error('Failed to create new project:', e);
            dialog.showErrorBox('Error', 'Failed to create new project: ' + e.message);
        }
    }
}

async function handleOpenProjectDialog(mainWindow) {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (!canceled && filePaths.length > 0) {
        let selectedPath = filePaths[0];
        if (path.basename(selectedPath) !== 'vortex') {
             const checkVortex = path.join(selectedPath, 'vortex');
             if (fs.existsSync(checkVortex)) {
                 selectedPath = checkVortex;
             } else {
                 dialog.showErrorBox('Invalid Project', 'The selected folder does not contain a "vortex" folder.');
                 return;
             }
        }
        await openProject(mainWindow, selectedPath);
    }
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
                        await handleCreateProject(mainWindow);
                    }
                },
                {
                    label: 'Open Project...',
                    click: async () => {
                        await handleOpenProjectDialog(mainWindow);
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
        {
          label: 'Open Path...',
          click: () => mainWindow.webContents.send('menu:open-path')
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
            return files.filter(file => file.endsWith('.json')).map(file => {
                const imgName = file.replace(/\.json$/, '.png');
                const imgPath = path.join(routinesDir, imgName);
                let imagePath = null;
                if (fs.existsSync(imgPath)) {
                    try {
                        const data = fs.readFileSync(imgPath);
                        imagePath = `data:image/png;base64,${data.toString('base64')}`;
                    } catch (err) {
                        console.error('Error reading image thumbnail:', err);
                    }
                }
                return {
                    name: file,
                    imagePath: imagePath
                };
            });
        }
    } catch (e) {
        console.error('Failed to list routines:', e);
    }
    return [];
});

ipcMain.handle('routines:save', async (event, filename, content, imageBase64) => {
    if (!currentProjectPath) return false;
    try {
        const routinesDir = path.join(currentProjectPath, 'vortex routines');
        if (!fs.existsSync(routinesDir)) fs.mkdirSync(routinesDir);
        
        const filePath = path.join(routinesDir, filename);
        fs.writeFileSync(filePath, content);

        if (imageBase64) {
            const base64Data = imageBase64.replace(/^data:image\/png;base64,/, "");
            const imgPath = path.join(routinesDir, filename.replace(/\.json$/, '.png'));
            fs.writeFileSync(imgPath, base64Data, 'base64');
        }

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

ipcMain.handle('routines:delete', async (event, filename) => {
    if (!currentProjectPath) return false;
    try {
        const routinesDir = path.join(currentProjectPath, 'vortex routines');
        const filePath = path.join(routinesDir, filename);
        const imgPath = path.join(routinesDir, filename.replace(/\.json$/, '.png'));

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        
        return true;
    } catch (e) {
        console.error('Failed to delete routine:', e);
        return false;
    }
});

ipcMain.handle('projects:getRecent', () => {
    return getRecentProjects();
});

ipcMain.handle('projects:open', async (event, projectPath) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (projectPath) {
        return await openProject(win, projectPath);
    } else {
        await handleOpenProjectDialog(win);
        return true;
    }
});

ipcMain.handle('projects:create', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    await handleCreateProject(win);
    return true;
});
