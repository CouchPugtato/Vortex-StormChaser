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
            const pathImagesDir = path.join(projectPath, 'path_images');

            if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir);
            if (!fs.existsSync(routinesDir)) fs.mkdirSync(routinesDir);
            if (!fs.existsSync(pathImagesDir)) fs.mkdirSync(pathImagesDir);

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


ipcMain.handle('routines:list', async (event, subfolder = '') => {
    if (!currentProjectPath) return [];
    try {
        const routinesDir = path.join(currentProjectPath, 'vortex routines', subfolder);
        const imagesDir = path.join(currentProjectPath, 'path_images', subfolder);

        if (!fs.existsSync(imagesDir)) {
             try { fs.mkdirSync(imagesDir, { recursive: true }); } catch(e) {}
        }

        if (fs.existsSync(routinesDir)) {
            const items = fs.readdirSync(routinesDir, { withFileTypes: true });
            const results = [];

            items.filter(dirent => dirent.isDirectory()).forEach(dirent => {
                results.push({
                    name: dirent.name,
                    isDirectory: true
                });
            });

            items.filter(dirent => !dirent.isDirectory() && dirent.name.endsWith('.json')).forEach(dirent => {
                const file = dirent.name;
                const imgName = file.replace(/\.json$/, '.png');
                
                const oldImgPath = path.join(routinesDir, imgName);
                const newImgPath = path.join(imagesDir, imgName);
                
                if (fs.existsSync(oldImgPath) && !fs.existsSync(newImgPath)) {
                    try {
                        fs.renameSync(oldImgPath, newImgPath);
                    } catch (err) {
                        console.error('Error migrating image:', err);
                    }
                }

                let imagePath = null;
                if (fs.existsSync(newImgPath)) {
                    try {
                        const data = fs.readFileSync(newImgPath);
                        imagePath = `data:image/png;base64,${data.toString('base64')}`;
                    } catch (err) {
                        console.error('Error reading image thumbnail:', err);
                    }
                } else if (fs.existsSync(oldImgPath)) {
                    try {
                        const data = fs.readFileSync(oldImgPath);
                        imagePath = `data:image/png;base64,${data.toString('base64')}`;
                    } catch (err) {}
                }

                results.push({
                    name: file,
                    imagePath: imagePath,
                    isDirectory: false
                });
            });
            
            return results;
        }
    } catch (e) {
        console.error('Failed to list routines:', e);
    }
    return [];
});

ipcMain.handle('routines:createFolder', async (event, subfolder, folderName) => {
    if (!currentProjectPath) return false;
    try {
        const targetDir = path.join(currentProjectPath, 'vortex routines', subfolder, folderName);
        const targetImgDir = path.join(currentProjectPath, 'path_images', subfolder, folderName);
        
        let success = false;
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
            success = true;
        }
        
        if (!fs.existsSync(targetImgDir)) {
            fs.mkdirSync(targetImgDir, { recursive: true });
        }
        
        return success;
    } catch (e) {
        console.error('Failed to create folder:', e);
        return false;
    }
});

ipcMain.handle('routines:deleteFolder', async (event, subfolder, folderName) => {
    if (!currentProjectPath) return false;
    try {
        const targetDir = path.join(currentProjectPath, 'vortex routines', subfolder, folderName);
        const targetImgDir = path.join(currentProjectPath, 'path_images', subfolder, folderName);
        
        if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
        }
        if (fs.existsSync(targetImgDir)) {
            fs.rmSync(targetImgDir, { recursive: true, force: true });
        }
        return true;
    } catch (e) {
        console.error('Failed to delete folder:', e);
        return false;
    }
});

ipcMain.handle('routines:save', async (event, subfolder, filename, content, imageBase64) => {
    if (!currentProjectPath) return false;
    try {
        const routinesDir = path.join(currentProjectPath, 'vortex routines', subfolder);
        const imagesDir = path.join(currentProjectPath, 'path_images', subfolder);
        
        if (!fs.existsSync(routinesDir)) fs.mkdirSync(routinesDir, { recursive: true });
        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
        
        const filePath = path.join(routinesDir, filename);
        fs.writeFileSync(filePath, content);

        if (imageBase64) {
            const base64Data = imageBase64.replace(/^data:image\/png;base64,/, "");
            const imgPath = path.join(imagesDir, filename.replace(/\.json$/, '.png'));
            fs.writeFileSync(imgPath, base64Data, 'base64');
        }

        return true;
    } catch (e) {
        console.error('Failed to save routine:', e);
        return false;
    }
});

ipcMain.handle('routines:load', async (event, subfolder, filename) => {
    if (!currentProjectPath) return null;
    try {
        const filePath = path.join(currentProjectPath, 'vortex routines', subfolder, filename);
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Failed to load routine:', e);
    }
    return null;
});

ipcMain.handle('routines:delete', async (event, subfolder, filename) => {
    if (!currentProjectPath) return false;
    try {
        const routinesDir = path.join(currentProjectPath, 'vortex routines', subfolder);
        const imagesDir = path.join(currentProjectPath, 'path_images', subfolder);
        
        const filePath = path.join(routinesDir, filename);
        const imgPath = path.join(imagesDir, filename.replace(/\.json$/, '.png'));
        const oldImgPath = path.join(routinesDir, filename.replace(/\.json$/, '.png'));

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        if (fs.existsSync(oldImgPath)) fs.unlinkSync(oldImgPath);
        
        return true;
    } catch (e) {
        console.error('Failed to delete routine:', e);
        return false;
    }
});

ipcMain.handle('routines:moveFile', async (event, sourceSubfolder, filename, targetSubfolder) => {
    if (!currentProjectPath) return false;
    try {
        const sourceDir = path.join(currentProjectPath, 'vortex routines', sourceSubfolder);
        const targetDir = path.join(currentProjectPath, 'vortex routines', targetSubfolder);
        
        const sourceImgDir = path.join(currentProjectPath, 'path_images', sourceSubfolder);
        const targetImgDir = path.join(currentProjectPath, 'path_images', targetSubfolder);

        if (!fs.existsSync(targetDir)) {
             fs.mkdirSync(targetDir, { recursive: true });
        }
        
        if (!fs.existsSync(targetImgDir)) {
             fs.mkdirSync(targetImgDir, { recursive: true });
        }

        const sourceFile = path.join(sourceDir, filename);
        const targetFile = path.join(targetDir, filename);
        
        const sourceImg = path.join(sourceImgDir, filename.replace(/\.json$/, '.png'));
        const targetImg = path.join(targetImgDir, filename.replace(/\.json$/, '.png'));
        
        const legacySourceImg = path.join(sourceDir, filename.replace(/\.json$/, '.png'));

        if (fs.existsSync(sourceFile)) {
            fs.renameSync(sourceFile, targetFile);
        }
        
        if (fs.existsSync(sourceImg)) {
            fs.renameSync(sourceImg, targetImg);
        } else if (fs.existsSync(legacySourceImg)) {
            fs.renameSync(legacySourceImg, targetImg);
        }

        return true;
    } catch (e) {
        console.error('Failed to move file:', e);
        return false;
    }
});

ipcMain.handle('routines:duplicate', async (event, subfolder, filename) => {
    if (!currentProjectPath) return null;
    try {
        const routinesDir = path.join(currentProjectPath, 'vortex routines', subfolder);
        const imagesDir = path.join(currentProjectPath, 'path_images', subfolder);
        const sourceFile = path.join(routinesDir, filename);
        const sourceImg = path.join(imagesDir, filename.replace(/\.json$/, '.png'));
        const legacySourceImg = path.join(routinesDir, filename.replace(/\.json$/, '.png'));

        if (!fs.existsSync(sourceFile)) {
            return null;
        }

        if (!fs.existsSync(routinesDir)) fs.mkdirSync(routinesDir, { recursive: true });
        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

        const baseName = filename.replace(/\.json$/, '');
        let duplicateName = `${baseName} copy.json`;
        let counter = 2;
        while (fs.existsSync(path.join(routinesDir, duplicateName))) {
            duplicateName = `${baseName} copy ${counter}.json`;
            counter++;
        }

        const targetFile = path.join(routinesDir, duplicateName);
        fs.copyFileSync(sourceFile, targetFile);

        const targetImg = path.join(imagesDir, duplicateName.replace(/\.json$/, '.png'));
        if (fs.existsSync(sourceImg)) {
            fs.copyFileSync(sourceImg, targetImg);
        } else if (fs.existsSync(legacySourceImg)) {
            fs.copyFileSync(legacySourceImg, targetImg);
        }

        return duplicateName;
    } catch (e) {
        console.error('Failed to duplicate routine:', e);
        return null;
    }
});

ipcMain.handle('routines:rename', async (event, subfolder, oldFilename, newName) => {
    if (!currentProjectPath) return null;
    try {
        const routinesDir = path.join(currentProjectPath, 'vortex routines', subfolder);
        const imagesDir = path.join(currentProjectPath, 'path_images', subfolder);
        const sourceFile = path.join(routinesDir, oldFilename);

        if (!fs.existsSync(sourceFile)) {
            return null;
        }

        const trimmedName = (newName || '').trim();
        if (!trimmedName) {
            return null;
        }

        const newFilename = trimmedName.endsWith('.json') ? trimmedName : `${trimmedName}.json`;
        if (newFilename === oldFilename) {
            return newFilename;
        }

        const targetFile = path.join(routinesDir, newFilename);
        if (fs.existsSync(targetFile)) {
            return null;
        }

        fs.renameSync(sourceFile, targetFile);

        const oldImageName = oldFilename.replace(/\.json$/, '.png');
        const newImageName = newFilename.replace(/\.json$/, '.png');
        const imagePath = path.join(imagesDir, oldImageName);
        const newImagePath = path.join(imagesDir, newImageName);
        const legacyImagePath = path.join(routinesDir, oldImageName);

        if (fs.existsSync(imagePath)) {
            fs.renameSync(imagePath, newImagePath);
        } else if (fs.existsSync(legacyImagePath)) {
            fs.renameSync(legacyImagePath, newImagePath);
        }

        return newFilename;
    } catch (e) {
        console.error('Failed to rename routine:', e);
        return null;
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
