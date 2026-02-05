const canvas = document.getElementById('fieldCanvas');
const ctx = canvas.getContext('2d');

const cropSlidersDiv = document.getElementById('cropSliders');
const robotSettingsDiv = document.getElementById('robotSettings');
const pointsList = document.getElementById('pointsList');

const sliders = {
    left: document.getElementById('sliderLeft'),
    right: document.getElementById('sliderRight'),
    top: document.getElementById('sliderTop'),
    bottom: document.getElementById('sliderBottom')
};

const robotInputs = {
    width: document.getElementById('robotWidth'),
    height: document.getElementById('robotHeight'),
    bumper: document.getElementById('robotBumper'),
    speed: document.getElementById('robotSpeed')
};

const valLabels = {
    left: document.getElementById('valLeft'),
    right: document.getElementById('valRight'),
    top: document.getElementById('valTop'),
    bottom: document.getElementById('valBottom')
};

let currentImage = null;
let points = [];
let events = [];
let fieldConstants = {
    width: 16.541,
    height: 8.067
};

const METERS_PER_INCH = 0.0254;

let robotSettings = {
    width: 28 * METERS_PER_INCH,
    height: 28 * METERS_PER_INCH,
    bumper: 3 * METERS_PER_INCH,
    speed: 120 * METERS_PER_INCH
};

let isUpdatingSliders = false;
let saveSettingsTimeout = null;
let isDraggingCrop = false;
let isDraggingPoint = false;
let isDraggingRotation = false;
let isDraggingEvent = false;
let draggingEventIndex = -1;
let dragStartEventPositions = [];
let dragStart = { x: 0, y: 0 };
let isPlaying = false;
let animationStartTime = 0;
let animationRequestId = null;

const btnPlay = document.getElementById('btnPlay');
const btnAddEvent = null;
const eventTitleInput = null;
const eventTInput = null;


const currentPathDisplay = document.getElementById('currentPathDisplay');
const btnSavePath = document.getElementById('btnSavePath');
const btnOpenPath = document.getElementById('btnOpenPath');
const openPathModal = document.getElementById('openPathModal');
const folderList = document.getElementById('folderList');
const fileList = document.getElementById('fileList');
const foldersTitle = document.getElementById('foldersTitle');
const filesTitle = document.getElementById('filesTitle');
const pathDivider = document.getElementById('pathDivider');
const closeModalBtn = document.querySelector('.close-modal');
const btnNewFolderFromModal = document.getElementById('btnNewFolderFromModal');
const btnNewPathFromModal = document.getElementById('btnNewPathFromModal');
const btnPathBack = document.getElementById('btnPathBack');
const openPathTitle = document.getElementById('openPathTitle');

const deleteConfirmModal = document.getElementById('deleteConfirmModal');
const btnConfirmDelete = document.getElementById('btnConfirmDelete');
const btnCancelDelete = document.getElementById('btnCancelDelete');
let pendingDeleteFilename = null;

const savePathModal = document.getElementById('savePathModal');
const savePathInput = document.getElementById('savePathInput');
const btnConfirmSave = document.getElementById('btnConfirmSave');
const btnCancelSave = document.getElementById('btnCancelSave');

const projectStartModal = document.getElementById('projectStartModal');
const btnNewProject = document.getElementById('btnNewProject');
const btnOpenExistingProject = document.getElementById('btnOpenExistingProject');
const recentProjectsList = document.getElementById('recentProjectsList');

let availableEvents = [];
let editingEventIndex = -1;
let currentPathName = null;
let currentRoutinePath = '';
let pendingDeleteIsFolder = false;

function updatePathDisplay() {
    if (currentPathDisplay) {
        currentPathDisplay.innerText = `Current Path: ${currentPathName || 'Untitled'}`;
    }
}

(async () => {
    if (recentProjectsList) {
        await loadRecentProjects();
    }

    const defaultPath = await window.electronAPI.getDefaultImage();
    if (defaultPath) {
        loadImage(defaultPath);
    }

    window.electronAPI.onMenuCommand(async (command, payload) => {
        switch (command) {
            case 'open-image':
                if (payload) loadImage(payload);
                break;
            case 'open-path':
                await openPathDialog();
                break;
            case 'export-path':
                if (points.length === 0) return;
                const exportData = {
                    points: points.map((p, i) => {
                        const coords = getFieldCoordinates(p.x, p.y);
                        return {
                            id: i + 1,
                            x: Number(coords.x.toFixed(4)),
                            y: Number(coords.y.toFixed(4)),
                            rotation: Number((p.rotation * 180 / Math.PI).toFixed(2))
                        };
                    }),
                    events: events
                };
                const success = await window.electronAPI.saveFile(JSON.stringify(exportData, null, 4));
                break;
            case 'toggle-crop':
                const isCropHidden = cropSlidersDiv.classList.contains('hidden');
                if (isCropHidden) {
                    cropSlidersDiv.classList.remove('hidden');
                } else {
                    cropSlidersDiv.classList.add('hidden');
                    saveSettings();
                }
                draw();
                break;
            case 'toggle-robot':
                const isRobotHidden = robotSettingsDiv.classList.contains('hidden');
                if (isRobotHidden) {
                    robotSettingsDiv.classList.remove('hidden');
                } else {
                    robotSettingsDiv.classList.add('hidden');
                    saveSettings();
                }
                break;
            case 'clear-points':
                points = [];
                events = [];
                draw();
                updatePointsList();
                break;
            case 'load-events-config':
                loadEvents(payload);
                break;
            case 'project-loaded':
                handleProjectLoaded(payload);
                break;
        }
    });
})();

let currentProjectName = 'Project';

function handleProjectLoaded(data) {
    if (projectStartModal) projectStartModal.classList.add('hidden');

    if (data.path) {
        const parts = data.path.replace(/[\\/]$/, '').split(/[\\/]/);
        if (parts.length > 1 && parts[parts.length-1] === 'vortex') {
             currentProjectName = parts[parts.length-2];
        } else {
             currentProjectName = parts[parts.length-1];
        }
    }

    if (data.events && Array.isArray(data.events)) {
        availableEvents = data.events;
    }
    
    if (data.settings) {
        const settings = data.settings;
        if (settings.crop) {
            sliders.left.value = settings.crop.left;
            sliders.right.value = settings.crop.right;
            sliders.top.value = settings.crop.top;
            sliders.bottom.value = settings.crop.bottom;
            updateSliderLabels();
        }
        if (settings.robot) {
            robotSettings.width = settings.robot.width || (28 * METERS_PER_INCH);
            robotSettings.height = settings.robot.height || (28 * METERS_PER_INCH);
            robotSettings.bumper = settings.robot.bumper || (3 * METERS_PER_INCH);
            robotSettings.speed = settings.robot.speed || (120 * METERS_PER_INCH);
            
            robotInputs.width.value = (robotSettings.width / METERS_PER_INCH).toFixed(1);
            robotInputs.height.value = (robotSettings.height / METERS_PER_INCH).toFixed(1);
            robotInputs.bumper.value = (robotSettings.bumper / METERS_PER_INCH).toFixed(1);
            robotInputs.speed.value = (robotSettings.speed / METERS_PER_INCH).toFixed(1);
        }
    }
    
    
    points = [];
    events = [];
    
    draw();
    updatePointsList();

    openPathDialog();
}

function loadEvents(data) {
    if (Array.isArray(data) && data.every(item => typeof item === 'string')) {
        availableEvents = data;
        updatePointsList(); 
    } else {
        alert('Invalid JSON format. Expected an array of strings.');
    }
}

Object.keys(robotInputs).forEach(key => {
    robotInputs[key].addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
            robotSettings[key] = val * METERS_PER_INCH;
            draw();
            saveSettings();
        }
    });
});

canvas.addEventListener('mousedown', (e) => {
    if (!currentImage) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const isCropping = !cropSlidersDiv.classList.contains('hidden');

    if (isCropping) {
        if (e.button === 0) {
            isDraggingCrop = true;
            
            const scale = Math.min(canvas.width / currentImage.width, canvas.height / currentImage.height);
            const w = currentImage.width * scale;
            const h = currentImage.height * scale;
            const x = (canvas.width - w) / 2;
            const y = (canvas.height - h) / 2;
            
            const imgX = (mouseX - x) / scale;
            const imgY = (mouseY - y) / scale;
            
            dragStart = { x: imgX, y: imgY };
        }
    } else {
        const crop = getCropRect();
        
        const scaleX = canvas.width / crop.w;
        const scaleY = canvas.height / crop.h;
        
        const imgX = crop.x + (mouseX / scaleX);
        const imgY = crop.y + (mouseY / scaleY);
        
        if (e.button === 0) {
            const rotHandleIdx = findClosestRotationHandleIndex(imgX, imgY);
            if (rotHandleIdx !== -1) {
                isDraggingRotation = true;
                draggingPointIndex = rotHandleIdx;
            } else {
                const closestIdx = findClosestPointIndex(imgX, imgY);
                if (closestIdx !== -1) {
                    isDraggingPoint = true;
                    draggingPointIndex = closestIdx;
                    
                    dragStartEventPositions = [];
                    if (events.length > 0 && points.length >= 2) {
                        const pathMetrics = calculatePathMetrics();
                        if (pathMetrics) {
                            const fieldCoordsPoints = points.map(p => getFieldCoordinates(p.x, p.y));
                            const splinePoints = getCatmullRomSplinePoints(fieldCoordsPoints, 50);
                            events.forEach(e => {
                                const pos = getPointAtDist(e.t * pathMetrics.totalLength, splinePoints);
                                if (pos) {
                                    dragStartEventPositions.push({ event: e, fieldX: pos.x, fieldY: pos.y });
                                }
                            });
                        }
                    }
                } else {
                    addPoint(imgX, imgY);
                }
            }
        } else if (e.button === 2) {
             const eventIdx = findClosestEventIndex(imgX, imgY);
             if (eventIdx !== -1) {
                 isDraggingEvent = true;
                 draggingEventIndex = eventIdx;
             } else {
                 const { t, dist } = findClosestPointOnPath(imgX, imgY);
                 const threshold = 15 / scaleX; 
                 if (dist < threshold) {
                      let eventName = "Event " + (events.length + 1);
                      if (availableEvents.length > 0) {
                          eventName = availableEvents[0];
                      }

                      const newEvent = {
                          name: eventName,
                          t: t
                      };
                      events.push(newEvent);
                      events.sort((a, b) => a.t - b.t);
                      
                      isDraggingEvent = true;
                      draggingEventIndex = events.findIndex(ev => ev === newEvent);
                      
                      draw();
                      updatePointsList();
                 }
             }
        }
    }
});

window.addEventListener('mousemove', (e) => {
    if ((!isDraggingCrop && !isDraggingPoint && !isDraggingRotation && !isDraggingEvent) || !currentImage) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isDraggingEvent) {
        const crop = getCropRect();
        const scaleX = canvas.width / crop.w;
        const scaleY = canvas.height / crop.h;
        
        const imgX = crop.x + (mouseX / scaleX);
        const imgY = crop.y + (mouseY / scaleY);
        
        const { t } = findClosestPointOnPath(imgX, imgY);
        
        events[draggingEventIndex].t = t;
        events.sort((a, b) => a.t - b.t);
        draggingEventIndex = events.findIndex(ev => ev.t === t);
        
        draw();
        updatePointsList();
        return;
    }

    if (isDraggingRotation) {
        const crop = getCropRect();
        const scaleX = canvas.width / crop.w;
        const scaleY = canvas.height / crop.h;
        
        const imgX = crop.x + (mouseX / scaleX);
        const imgY = crop.y + (mouseY / scaleY);

        const imgPxPerMeterX = crop.w / fieldConstants.width;
        const imgPxPerMeterY = crop.h / fieldConstants.height;

        const p = points[draggingPointIndex];
        
        const dx = (imgX - p.x) / imgPxPerMeterX;
        const dy = (imgY - p.y) / imgPxPerMeterY;
        
        p.rotation = Math.atan2(dy, dx);
        
        draw();
        updatePointsList();
        return;
    }

    if (isDraggingPoint) {
        const crop = getCropRect();
        const scaleX = canvas.width / crop.w;
        const scaleY = canvas.height / crop.h;
        
        const imgX = crop.x + (mouseX / scaleX);
        const imgY = crop.y + (mouseY / scaleY);

        points[draggingPointIndex].x = imgX;
        points[draggingPointIndex].y = imgY;
        
        if (dragStartEventPositions.length > 0 && points.length >= 2) {
             const fieldCoordsPoints = points.map(p => getFieldCoordinates(p.x, p.y));
             const splinePoints = getCatmullRomSplinePoints(fieldCoordsPoints, 50);
             
             let totalLength = 0;
             for (let i = 0; i < splinePoints.length - 1; i++) {
                 const dx = splinePoints[i+1].x - splinePoints[i].x;
                 const dy = splinePoints[i+1].y - splinePoints[i].y;
                 totalLength += Math.sqrt(dx*dx + dy*dy);
             }
             
             dragStartEventPositions.forEach(item => {
                 let minDist = Infinity;
                 let closestT = 0;
                 let distSoFar = 0;
                 
                 for (let i = 0; i < splinePoints.length - 1; i++) {
                     const p1 = splinePoints[i];
                     const p2 = splinePoints[i+1];
                     
                     const dx = p2.x - p1.x;
                     const dy = p2.y - p1.y;
                     const lenSq = dx*dx + dy*dy;
                     const len = Math.sqrt(lenSq);
                     
                     if (lenSq > 0) {
                         const tSeg = ((item.fieldX - p1.x) * dx + (item.fieldY - p1.y) * dy) / lenSq;
                         const tClamped = Math.max(0, Math.min(1, tSeg));
                         
                         const projX = p1.x + tClamped * dx;
                         const projY = p1.y + tClamped * dy;
                         const dist = Math.sqrt(Math.pow(projX - item.fieldX, 2) + Math.pow(projY - item.fieldY, 2));
                         
                         if (dist < minDist) {
                             minDist = dist;
                             closestT = (distSoFar + tClamped * len) / totalLength;
                         }
                     }
                     distSoFar += len;
                 }
                 item.event.t = Math.max(0, Math.min(1, closestT));
             });
             events.sort((a, b) => a.t - b.t);
        }
        
        draw();
        updatePointsList();
        return;
    }

    const scale = Math.min(canvas.width / currentImage.width, canvas.height / currentImage.height);
    const w = currentImage.width * scale;
    const h = currentImage.height * scale;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;
    
    let currentX = (mouseX - x) / scale;
    let currentY = (mouseY - y) / scale;
    
    currentX = Math.max(0, Math.min(currentImage.width, currentX));
    currentY = Math.max(0, Math.min(currentImage.height, currentY));

    const dx = currentX - dragStart.x;
    const dy = currentY - dragStart.y;
    
    const xEnd = dragStart.x + dx;
    const yEnd = dragStart.y + dy;
    
    sliders.left.value = Math.min(dragStart.x, xEnd);
    sliders.right.value = Math.max(dragStart.x, xEnd);
    sliders.top.value = Math.min(dragStart.y, yEnd);
    sliders.bottom.value = Math.max(dragStart.y, yEnd);
    
    updateSliderLabels();
    draw();
});

window.addEventListener('mouseup', () => {
    isDraggingCrop = false;
    isDraggingPoint = false;
    isDraggingRotation = false;
    isDraggingEvent = false;
    draggingPointIndex = -1;
    draggingEventIndex = -1;
});

canvas.addEventListener('contextmenu', (e) => {
    if (isDraggingEvent) {
        e.preventDefault();
        return;
    }
    
    e.preventDefault();
    if (!currentImage) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const crop = getCropRect();
    const scaleX = canvas.width / crop.w;
    const scaleY = canvas.height / crop.h;
    
    const imgX = crop.x + (mouseX / scaleX);
    const imgY = crop.y + (mouseY / scaleY);
    
    const eventIdx = findClosestEventIndex(imgX, imgY);
    if (eventIdx !== -1) {
        return; 
    }

    deleteClosestPoint(imgX, imgY);
});



btnPlay.addEventListener('click', () => {
    if (points.length < 2) return;
    
    if (isPlaying) {
        isPlaying = false;
        btnPlay.innerText = "Play Animation";
        btnPlay.style.backgroundColor = "#2e7d32";
        cancelAnimationFrame(animationRequestId);
        draw(); 
    } else {
        isPlaying = true;
        btnPlay.innerText = "Stop Animation";
        btnPlay.style.backgroundColor = "#c62828";
        animationStartTime = performance.now();
        animate();
    }
});


async function saveRoutineToDisk(name) {
    const exportData = {
        points: points.map((p, i) => {
            const coords = getFieldCoordinates(p.x, p.y);
            return {
                id: i + 1,
                x: Number(coords.x.toFixed(4)),
                y: Number(coords.y.toFixed(4)),
                rotation: Number((p.rotation * 180 / Math.PI).toFixed(2))
            };
        }),
        events: events
    };

    const filename = name.endsWith('.json') ? name : name + '.json';
    const imageBase64 = canvas.toDataURL('image/png');
    const success = await window.electronAPI.saveRoutine(currentRoutinePath, filename, JSON.stringify(exportData, null, 4), imageBase64);
    if (success) {
        currentPathName = filename;
        updatePathDisplay();
        
        const originalText = btnSavePath.innerText;
        const originalColor = btnSavePath.style.backgroundColor;
        
        btnSavePath.innerText = "Saved✓";
        btnSavePath.style.backgroundColor = "#2e7d32";
        
        setTimeout(() => {
            btnSavePath.innerText = originalText;
            btnSavePath.style.backgroundColor = originalColor;
        }, 1000);
    } else {
        alert('Failed to save path. Make sure a project is open.');
    }
}

if (btnSavePath) {
    btnSavePath.addEventListener('click', async () => {
        if (points.length === 0) {
            alert('No points to save.');
            return;
        }

        if (!currentPathName) {
            savePathInput.value = '';
            savePathModal.classList.remove('hidden');
            savePathInput.focus();
        } else {
            await saveRoutineToDisk(currentPathName);
        }
    });
}

if (btnConfirmSave) {
    btnConfirmSave.onclick = async () => {
        const name = savePathInput.value.trim();
        if (name) {
            await saveRoutineToDisk(name);
            savePathModal.classList.add('hidden');
        } else {
            alert('Please enter a valid name.');
        }
    };
}

if (btnCancelSave) {
    btnCancelSave.onclick = () => {
        savePathModal.classList.add('hidden');
    };
}

if (btnOpenPath) {
    btnOpenPath.addEventListener('click', openPathDialog);
}

if (btnNewPathFromModal) {
    btnNewPathFromModal.onclick = () => {
        points = [];
        events = [];
        currentPathName = null;
        updatePathDisplay();
        draw();
        updatePointsList();
        openPathModal.classList.add('hidden');
    };
}

const newFolderModal = document.getElementById('newFolderModal');
const newFolderInput = document.getElementById('newFolderInput');
const btnConfirmNewFolder = document.getElementById('btnConfirmNewFolder');
const btnCancelNewFolder = document.getElementById('btnCancelNewFolder');

if (btnNewFolderFromModal) {
    btnNewFolderFromModal.onclick = () => {
        newFolderInput.value = '';
        newFolderModal.classList.remove('hidden');
        newFolderInput.focus();
    };
}

if (btnConfirmNewFolder) {
    btnConfirmNewFolder.onclick = async () => {
        const name = newFolderInput.value.trim();
        if (name) {
            const success = await window.electronAPI.createFolder(currentRoutinePath, name);
            if (success) {
                newFolderModal.classList.add('hidden');
                await openPathDialog();
            } else {
                alert("Failed to create folder.");
            }
        } else {
            alert("Please enter a valid folder name.");
        }
    };
}

if (btnCancelNewFolder) {
    btnCancelNewFolder.onclick = () => {
        newFolderModal.classList.add('hidden');
    };
}

if (btnPathBack) {
    btnPathBack.onclick = async () => {
        if (!currentRoutinePath) return;
        const parts = currentRoutinePath.split(/[\\/]/);
        parts.pop();
        currentRoutinePath = parts.join('/');
        await openPathDialog();
    };
}

async function openPathDialog() {
    const routines = await window.electronAPI.listRoutines(currentRoutinePath);
    
    folderList.innerHTML = '';
    fileList.innerHTML = '';
    
    foldersTitle.style.display = 'none';
    filesTitle.style.display = 'none';
    pathDivider.style.display = 'none';
    
    if (currentRoutinePath) {
        btnPathBack.classList.remove('hidden');
        openPathTitle.innerText = `${currentProjectName}/${currentRoutinePath}`;
        
        btnPathBack.ondragover = (e) => {
            e.preventDefault();
            btnPathBack.style.backgroundColor = '#444';
        };
        btnPathBack.ondragleave = (e) => {
             btnPathBack.style.backgroundColor = '';
        };
        btnPathBack.ondrop = async (e) => {
            e.preventDefault();
            btnPathBack.style.backgroundColor = '';
            
            const filename = e.dataTransfer.getData('text/plain');
            if (filename) {
                const parentPath = currentRoutinePath.split(/[\\/]/).slice(0, -1).join('/');
                const success = await window.electronAPI.moveFile(currentRoutinePath, filename, parentPath);
                if (success) {
                    await openPathDialog();
                } else {
                    alert('Failed to move file.');
                }
            }
        };

    } else {
        btnPathBack.classList.add('hidden');
        openPathTitle.innerText = currentProjectName;
        
        btnPathBack.ondragover = null;
        btnPathBack.ondrop = null;
    }

    if (routines.length === 0) {
        fileList.className = 'file-list';
        const li = document.createElement('li');
        li.innerText = "No routines found.";
        fileList.appendChild(li);
    } else {
        folderList.className = 'folder-grid';
        fileList.className = 'path-grid';
        
        const folders = routines.filter(item => item.isDirectory);
        const files = routines.filter(item => !item.isDirectory);
        
        if (folders.length > 0) {
            foldersTitle.style.display = 'block';
            folders.forEach(item => {
                const li = createPathItemElement(item);
                folderList.appendChild(li);
            });
        }
        
        if (files.length > 0) {
            filesTitle.style.display = 'block';
            files.forEach(item => {
                const li = createPathItemElement(item);
                fileList.appendChild(li);
            });
        }
        
        if (folders.length > 0 && files.length > 0) {
            pathDivider.style.display = 'block';
        }
    }
    
    openPathModal.classList.remove('hidden');
}

function createPathItemElement(item) {
    const li = document.createElement('li');
    li.className = 'path-card';
    li.style.position = 'relative';

    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'delete-path-btn';
    deleteBtn.innerHTML = '&#x2715;';
    deleteBtn.title = item.isDirectory ? 'Delete Folder' : 'Delete Path';
    
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        pendingDeleteFilename = item.name;
        pendingDeleteIsFolder = item.isDirectory;
        deleteConfirmModal.classList.remove('hidden');
    };

    const span = document.createElement('span');
    span.innerText = item.isDirectory ? item.name : item.name.replace('.json', '');

    if (item.isDirectory) {
        li.classList.add('folder-card');
        li.onclick = async () => {
            currentRoutinePath = currentRoutinePath ? `${currentRoutinePath}/${item.name}` : item.name;
            await openPathDialog();
        };
        
        li.ondragover = (e) => {
            e.preventDefault();
            li.style.borderColor = '#fff';
            li.style.backgroundColor = '#333';
        };
        li.ondragleave = (e) => {
            li.style.borderColor = '';
            li.style.backgroundColor = '';
        };
        li.ondrop = async (e) => {
            e.preventDefault();
            li.style.borderColor = '';
            li.style.backgroundColor = '';
            
            const filename = e.dataTransfer.getData('text/plain');
            if (filename) {
                const targetFolder = currentRoutinePath ? `${currentRoutinePath}/${item.name}` : item.name;
                const success = await window.electronAPI.moveFile(currentRoutinePath, filename, targetFolder);
                if (success) {
                    await openPathDialog();
                } else {
                    alert('Failed to move file.');
                }
            }
        };

    } else {
        li.draggable = true;
        li.ondragstart = (e) => {
            e.dataTransfer.setData('text/plain', item.name);
            e.dataTransfer.effectAllowed = 'move';
        };

        li.onclick = async () => {
            await loadRoutine(item.name);
            openPathModal.classList.add('hidden');
        };

        const img = document.createElement('img');
        img.draggable = false;
        if (item.imagePath) {
            img.src = item.imagePath;
        } else {
            img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
            img.style.backgroundColor = '#333';
        }
        li.appendChild(img);
    }

    li.appendChild(span);
    li.appendChild(deleteBtn);
    return li;
}

if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener('click', async () => {
        if (pendingDeleteFilename) {
            let success = false;
            if (pendingDeleteIsFolder) {
                success = await window.electronAPI.deleteFolder(currentRoutinePath, pendingDeleteFilename);
            } else {
                success = await window.electronAPI.deleteRoutine(currentRoutinePath, pendingDeleteFilename);
            }

            if (success) {
                await openPathDialog();
            } else {
                alert('Failed to delete item.');
            }
            deleteConfirmModal.classList.add('hidden');
            pendingDeleteFilename = null;
            pendingDeleteIsFolder = false;
        }
    });
}

if (btnCancelDelete) {
    btnCancelDelete.addEventListener('click', () => {
        deleteConfirmModal.classList.add('hidden');
        pendingDeleteFilename = null;
        pendingDeleteIsFolder = false;
    });
}

if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
        openPathModal.classList.add('hidden');
    });
}

window.addEventListener('click', (e) => {
    if (e.target === openPathModal) {
        openPathModal.classList.add('hidden');
    }
});

async function loadRoutine(filename) {
    const data = await window.electronAPI.loadRoutine(currentRoutinePath, filename);
    if (!data) {
        alert('Failed to load routine.');
        return;
    }
    
    
    if (!data.points || !Array.isArray(data.points)) {
        alert('Invalid routine file format.');
        return;
    }

    currentPathName = filename;
    updatePathDisplay();

    
    
    
    
    points = [];
    events = [];

    
    
    
    if (!currentImage) {
        alert('Please load a field image first.');
        return;
    }

    const crop = getCropRect();
    
    data.points.forEach(p => {
        
        const imgPos = getFieldCoordinatesInverse(p.x, p.y, crop);
        
        points.push({
            x: imgPos.x,
            y: imgPos.y,
            rotation: (p.rotation || 0) * Math.PI / 180
        });
    });

    if (data.events && Array.isArray(data.events)) {
        events = data.events;
    }

    draw();
    updatePointsList();
}

Object.keys(sliders).forEach(key => {
    sliders[key].addEventListener('input', (e) => {
        if (isUpdatingSliders) return;
        
        valLabels[key].innerText = e.target.value;
        
        draw();
        updatePointsList(); 
    });
});

function loadImage(src) {
    const img = new Image();
    img.onload = async () => {
        currentImage = img;
        
        sliders.left.max = img.width;
        sliders.right.max = img.width;
        sliders.top.max = img.height;
        sliders.bottom.max = img.height;
        
        const settings = await window.electronAPI.loadSettings();
        if (settings) {
            if (settings.crop) {
                sliders.left.value = settings.crop.left;
                sliders.right.value = settings.crop.right;
                sliders.top.value = settings.crop.top;
                sliders.bottom.value = settings.crop.bottom;
            }
            if (settings.robot) {
        robotSettings.width = settings.robot.width || (28 * METERS_PER_INCH);
        robotSettings.height = settings.robot.height || (28 * METERS_PER_INCH);
        robotSettings.bumper = settings.robot.bumper || (3 * METERS_PER_INCH);
        robotSettings.speed = settings.robot.speed || (120 * METERS_PER_INCH);
        robotInputs.width.value = (robotSettings.width / METERS_PER_INCH).toFixed(1);
        robotInputs.height.value = (robotSettings.height / METERS_PER_INCH).toFixed(1);
        robotInputs.bumper.value = (robotSettings.bumper / METERS_PER_INCH).toFixed(1);
        robotInputs.speed.value = (robotSettings.speed / METERS_PER_INCH).toFixed(1);
    }
        } else {
            sliders.left.value = 0;
            sliders.right.value = img.width;
            sliders.top.value = 0;
            
            const targetRatio = fieldConstants.width / fieldConstants.height;
            const h = img.width / targetRatio;
            sliders.bottom.value = h;
        }
        
        updateSliderLabels();
        
        const container = document.getElementById('canvasContainer');
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        
        points = [];
        
        draw();
        updatePointsList();
    };
    img.src = src;
}

function updateSliderLabels() {
    Object.keys(sliders).forEach(key => {
        valLabels[key].innerText = Math.round(sliders[key].value);
    });
}

function saveSettings() {
    const settings = {
        crop: {
            left: sliders.left.value,
            right: sliders.right.value,
            top: sliders.top.value,
            bottom: sliders.bottom.value
        },
        robot: {
            width: robotSettings.width,
            height: robotSettings.height,
            bumper: robotSettings.bumper,
            speed: robotSettings.speed
        }
    };
    window.electronAPI.saveSettings(settings);
}

function getFieldCoordinatesInverse(fx, fy, cropOverride) {
    const crop = cropOverride || getCropRect();
    const relX = fx / fieldConstants.width;
    const relY = fy / fieldConstants.height;
    const imgX = crop.left + relX * crop.w;
    const imgY = crop.bottom - relY * crop.h;
    return { x: imgX, y: imgY };
}

function getPointAtDist(dist, splinePoints) {
    let currentDist = 0;
    for (let i = 0; i < splinePoints.length - 1; i++) {
        const p1 = splinePoints[i];
        const p2 = splinePoints[i+1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        
        if (currentDist + len >= dist) {
            const t = (dist - currentDist) / len;
            return {
                x: p1.x + (p2.x - p1.x) * t,
                y: p1.y + (p2.y - p1.y) * t
            };
        }
        currentDist += len;
    }
    return splinePoints[splinePoints.length - 1];
}

function addPoint(x, y) {
    const savedEventPositions = [];
    if (events.length > 0 && points.length >= 2) {
        const pathMetrics = calculatePathMetrics();
        if (pathMetrics) {
            const fieldCoordsPoints = points.map(p => getFieldCoordinates(p.x, p.y));
            const splinePoints = getCatmullRomSplinePoints(fieldCoordsPoints, 50);
            
            events.forEach(e => {
                const pos = getPointAtDist(e.t * pathMetrics.totalLength, splinePoints);
                if (pos) {
                    savedEventPositions.push({ event: e, fieldX: pos.x, fieldY: pos.y });
                }
            });
        }
    }

    points.push({ x, y, rotation: 0 });
    
    if (savedEventPositions.length > 0 && points.length >= 2) {
        savedEventPositions.forEach(item => {
            const imgPos = getFieldCoordinatesInverse(item.fieldX, item.fieldY);
            const result = findClosestPointOnPath(imgPos.x, imgPos.y);
            item.event.t = result.t;
        });
        events.sort((a, b) => a.t - b.t);
    }

    draw();
    updatePointsList();
}

function findClosestPointIndex(x, y) {
    const crop = getCropRect();
    const scaleX = canvas.width / crop.w;
    
    const threshold = 20 / scaleX; 

    let closestIdx = -1;
    let minDst = Infinity;
    
    points.forEach((p, i) => {
        const dst = Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2));
        if (dst < minDst) {
            minDst = dst;
            closestIdx = i;
        }
    });
    
    if (closestIdx !== -1 && minDst < threshold) {
        return closestIdx;
    }
    return -1;
}

function findClosestRotationHandleIndex(x, y) {
    if (!currentImage) return -1;
    const crop = getCropRect();
    const scaleX = canvas.width / crop.w;
    
    const imgPxPerMeterX = crop.w / fieldConstants.width;
    const imgPxPerMeterY = crop.h / fieldConstants.height;
    
    const threshold = 20 / scaleX; 
    
    let closestIdx = -1;
    let minDst = Infinity;
    
    const robotW = robotSettings.width;
    const robotH = robotSettings.height;
    
    const handleRadiusMeters = Math.max(robotW, robotH) / 2 + 0.5; 

    points.forEach((p, i) => {
        const offsetX = Math.cos(p.rotation) * handleRadiusMeters * imgPxPerMeterX;
        const offsetY = Math.sin(p.rotation) * handleRadiusMeters * imgPxPerMeterY;
        
        const hx = p.x + offsetX;
        const hy = p.y + offsetY;
        
        const dst = Math.sqrt(Math.pow(hx - x, 2) + Math.pow(hy - y, 2));
        if (dst < minDst) {
            minDst = dst;
            closestIdx = i;
        }
    });
    
    if (closestIdx !== -1 && minDst < threshold) {
        return closestIdx;
    }
    return -1;
}

function findClosestEventIndex(imgX, imgY) {
    if (events.length === 0 || points.length < 2) return -1;
    
    const pathMetrics = calculatePathMetrics();
    if (!pathMetrics) return -1;
    
    const fieldCoordsPoints = points.map(p => getFieldCoordinates(p.x, p.y));
    const splinePoints = getCatmullRomSplinePoints(fieldCoordsPoints, 50);
    const totalLength = pathMetrics.totalLength;

    const crop = getCropRect();
    const scaleX = canvas.width / crop.w;
    const threshold = 15 / scaleX; 

    let closestIdx = -1;
    let minDst = Infinity;

    events.forEach((ev, i) => {
        const targetDist = ev.t * totalLength;
        const pos = getPointAtDist(targetDist, splinePoints);
        if (pos) {
             const pImg = getFieldCoordinatesInverse(pos.x, pos.y, crop);
             const dst = Math.sqrt(Math.pow(pImg.x - imgX, 2) + Math.pow(pImg.y - imgY, 2));
             
             if (dst < minDst) {
                 minDst = dst;
                 closestIdx = i;
             }
        }
    });
    
    if (closestIdx !== -1 && minDst < threshold) {
        return closestIdx;
    }
    return -1;
}

function findClosestPointOnPath(imgX, imgY) {
    const fieldCoordsPoints = points.map(p => getFieldCoordinates(p.x, p.y));
    const splinePoints = getCatmullRomSplinePoints(fieldCoordsPoints, 50);
    
    const crop = getCropRect();
    
    let minDist = Infinity;
    let closestT = 0;
    let currentPathDist = 0;
    
    const pathMetrics = calculatePathMetrics();
    const totalLength = pathMetrics ? pathMetrics.totalLength : 1;
    
    for (let i = 0; i < splinePoints.length - 1; i++) {
        const p1 = splinePoints[i];
        const p2 = splinePoints[i+1];
        const dxField = p2.x - p1.x;
        const dyField = p2.y - p1.y;
        const lenField = Math.sqrt(dxField*dxField + dyField*dyField);
        
        const p1Img = getFieldCoordinatesInverse(p1.x, p1.y, crop);
        const p2Img = getFieldCoordinatesInverse(p2.x, p2.y, crop);
        const dxImg = p2Img.x - p1Img.x;
        const dyImg = p2Img.y - p1Img.y;
        const lenImgSq = dxImg*dxImg + dyImg*dyImg;
        
        if (lenImgSq > 0) {
            const tSeg = ((imgX - p1Img.x) * dxImg + (imgY - p1Img.y) * dyImg) / lenImgSq;
            const tClamped = Math.max(0, Math.min(1, tSeg));
            
            const projX = p1Img.x + tClamped * dxImg;
            const projY = p1Img.y + tClamped * dyImg;
            const dist = Math.sqrt(Math.pow(projX - imgX, 2) + Math.pow(projY - imgY, 2));
            
            if (dist < minDist) {
                minDist = dist;
                closestT = (currentPathDist + tClamped * lenField) / totalLength;
            }
        }
        
        currentPathDist += lenField;
    }

    return { t: Math.max(0, Math.min(1, closestT)), dist: minDist };
}

function deleteClosestPoint(x, y) {
    const crop = getCropRect();
    const scaleX = canvas.width / crop.w;
    const threshold = 10 / scaleX; 

    let closestIdx = -1;
    let minDst = Infinity;
    
    points.forEach((p, i) => {
        const dst = Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2));
        if (dst < minDst) {
            minDst = dst;
            closestIdx = i;
        }
    });
    
    if (closestIdx !== -1 && minDst < threshold) {
        points.splice(closestIdx, 1);
        draw();
        updatePointsList();
    }
}

function getCropRect() {
    const x1 = parseFloat(sliders.left.value);
    const x2 = parseFloat(sliders.right.value);
    const y1 = parseFloat(sliders.top.value);
    const y2 = parseFloat(sliders.bottom.value);
    
    let left = Math.min(x1, x2);
    let right = Math.max(x1, x2);
    let top = Math.min(y1, y2);
    let bottom = Math.max(y1, y2);

    if (right === left) right = left + 1;
    if (bottom === top) bottom = top + 1;

    return {
        x: left,
        y: top,
        w: right - left,
        h: bottom - top,
        left,
        right,
        top,
        bottom
    };
}

function getFieldCoordinates(imgX, imgY) {
    const crop = getCropRect();
    
    const relX = (imgX - crop.left) / crop.w;
    
    const relY = (crop.bottom - imgY) / crop.h;
    
    return {
        x: relX * fieldConstants.width,
        y: relY * fieldConstants.height
    };
}

function calculatePathMetrics() {
    if (points.length < 2) return null;

    const fieldCoordsPoints = points.map(p => getFieldCoordinates(p.x, p.y));
    const splinePoints = getCatmullRomSplinePoints(fieldCoordsPoints, 50);
    
    let totalLength = 0;
    const userSegmentLengths = [];
    
    const pointsPerSegment = 51; 
    
    for (let i = 0; i < points.length - 1; i++) {
        let segLen = 0;
        const startIndex = i * pointsPerSegment;
        
        for (let j = 0; j < 50; j++) {
            const p1 = splinePoints[startIndex + j];
            const p2 = splinePoints[startIndex + j + 1];
            if (p1 && p2) {
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                segLen += Math.sqrt(dx*dx + dy*dy);
            }
        }
        
        userSegmentLengths.push(segLen);
        totalLength += segLen;
    }
    
    return { totalLength, userSegmentLengths };
}

function getCatmullRomSplinePoints(points, segments = 20) {
    if (points.length < 2) return [];
    
    const splinePoints = [];
    
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i === 0 ? 0 : i - 1];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2 >= points.length ? points.length - 1 : i + 2];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        for (let j = 0; j <= segments; j++) {
            const t = j / segments;
            const t2 = t * t;
            const t3 = t2 * t;
            
            const cx = 3 * (cp1x - p1.x);
            const bx = 3 * (cp2x - cp1x) - cx;
            const ax = p2.x - p1.x - cx - bx;
            
            const cy = 3 * (cp1y - p1.y);
            const by = 3 * (cp2y - cp1y) - cy;
            const ay = p2.y - p1.y - cy - by;
            
            const x = ax * t3 + bx * t2 + cx * t + p1.x;
            const y = ay * t3 + by * t2 + cy * t + p1.y;
            
            splinePoints.push({ x, y });
        }
    }
    
    return splinePoints;
}

function animate() {
    if (!isPlaying) return;

    const now = performance.now();
    const elapsed = (now - animationStartTime) / 1000; 

    const fieldCoordsPoints = points.map(p => {
        const coords = getFieldCoordinates(p.x, p.y);
        return { x: coords.x, y: coords.y }; 
    });

    const splinePoints = getCatmullRomSplinePoints(fieldCoordsPoints, 50);
    
    let totalLength = 0;
    const segmentLengths = [];
    for (let i = 0; i < splinePoints.length - 1; i++) {
        const dx = splinePoints[i+1].x - splinePoints[i].x;
        const dy = splinePoints[i+1].y - splinePoints[i].y;
        const len = Math.sqrt(dx*dx + dy*dy);
        segmentLengths.push(len);
        totalLength += len;
    }

    const distanceTravelled = robotSettings.speed * elapsed;
    
    if (distanceTravelled >= totalLength) {
        isPlaying = false;
        btnPlay.innerText = "Play Animation";
        btnPlay.style.backgroundColor = "#2e7d32";
        draw();
        return;
    }

    let currentDist = 0;
    let currentPoint = splinePoints[0];
    let heading = 0;

    for (let i = 0; i < segmentLengths.length; i++) {
        if (currentDist + segmentLengths[i] >= distanceTravelled) {
            const segmentProgress = (distanceTravelled - currentDist) / segmentLengths[i];
            const p1 = splinePoints[i];
            const p2 = splinePoints[i+1];
            
            currentPoint = {
                x: p1.x + (p2.x - p1.x) * segmentProgress,
                y: p1.y + (p2.y - p1.y) * segmentProgress
            };

            
            
            const totalSplineSegments = splinePoints.length - 1;
            const currentSplineIndex = i + segmentProgress; 
            
            
            const pointsIndexFloat = currentSplineIndex / 50;
            const pIndex = Math.floor(pointsIndexFloat);
            const nextPIndex = Math.min(pIndex + 1, points.length - 1);
            const t = pointsIndexFloat - pIndex;
            
            const rot1 = points[pIndex].rotation;
            const rot2 = points[nextPIndex].rotation;
            
            let diff = rot2 - rot1;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            
            heading = rot1 + diff * t;

            break;
        }
        currentDist += segmentLengths[i];
    }

    draw(currentPoint, heading);
    animationRequestId = requestAnimationFrame(animate);
}

if (btnNewProject) {
    btnNewProject.onclick = async () => {
        await window.electronAPI.createProject();
    };
}

if (btnOpenExistingProject) {
    btnOpenExistingProject.onclick = async () => {
        await window.electronAPI.openProject(null);
    };
}

async function loadRecentProjects() {
    if (!recentProjectsList) return;
    const projects = await window.electronAPI.getRecentProjects();
    recentProjectsList.innerHTML = '';
    
    if (projects.length === 0) {
        const li = document.createElement('li');
        li.innerText = "No recent projects.";
        li.style.color = "#888";
        li.style.fontStyle = "italic";
        li.style.padding = "10px";
        recentProjectsList.appendChild(li);
    } else {
        projects.forEach(path => {
            const li = document.createElement('li');
            li.style.cursor = 'pointer';
            li.style.padding = '10px';
            li.style.borderBottom = '1px solid #444';
            li.style.display = 'flex';
            li.style.flexDirection = 'column';
            li.style.transition = 'background-color 0.2s';
            
            li.onmouseover = () => li.style.backgroundColor = '#333';
            li.onmouseout = () => li.style.backgroundColor = 'transparent';

            li.onclick = async () => {
                await window.electronAPI.openProject(path);
            };

            const nameSpan = document.createElement('span');
            
            const parts = path.replace(/[\\/]$/, '').split(/[\\/]/);
            let folderName = parts.pop();
            if (folderName.toLowerCase() === 'vortex' && parts.length > 0) {
                folderName = parts.pop();
            }
            nameSpan.innerText = folderName;
            nameSpan.style.fontWeight = 'bold';
            nameSpan.style.fontSize = '1.1em';
            nameSpan.style.color = '#eee';

            const pathSpan = document.createElement('span');
            pathSpan.innerText = path;
            pathSpan.style.fontSize = '0.8em';
            pathSpan.style.color = '#888';
            pathSpan.style.marginTop = '4px';

            li.appendChild(nameSpan);
            li.appendChild(pathSpan);
            recentProjectsList.appendChild(li);
        });
    }
}

function draw(robotPos = null, robotHeading = 0) {
    if (!currentImage) return;
    
    const container = document.getElementById('canvasContainer');
    const isCropping = !cropSlidersDiv.classList.contains('hidden');

    if (isCropping) {
        if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        }
    } else {
        const fieldRatio = fieldConstants.width / fieldConstants.height;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        
        let targetW = cw;
        let targetH = cw / fieldRatio;
        
        if (targetH > ch) {
            targetH = ch;
            targetW = ch * fieldRatio;
        }
        
        targetW = Math.floor(targetW);
        targetH = Math.floor(targetH);

        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
        }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const crop = getCropRect();

    if (isCropping) {
        const scale = Math.min(canvas.width / currentImage.width, canvas.height / currentImage.height);
        const w = currentImage.width * scale;
        const h = currentImage.height * scale;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2;

        ctx.drawImage(currentImage, x, y, w, h);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const cx = x + crop.x * scale;
        const cy = y + crop.y * scale;
        const cw = crop.w * scale;
        const ch = crop.h * scale;

        ctx.drawImage(
            currentImage, 
            crop.x, crop.y, crop.w, crop.h,
            cx, cy, cw, ch
        );

        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx, cy, cw, ch);

    } else {
        ctx.drawImage(
            currentImage, 
            crop.x, crop.y, crop.w, crop.h,
            0, 0, canvas.width, canvas.height
        );
        
        const scaleX = canvas.width / crop.w;
        const scaleY = canvas.height / crop.h;

        const canvasPxPerMeterX = canvas.width / fieldConstants.width;
        const canvasPxPerMeterY = canvas.height / fieldConstants.height;

        const getCorners = (cx, cy, wMeters, hMeters, rotation) => {
             const cos = Math.cos(rotation);
             const sin = Math.sin(rotation);
             const hw = wMeters / 2;
             const hh = hMeters / 2;
             
             const cornersM = [
                 {x: -hw, y: -hh}, {x: hw, y: -hh}, {x: hw, y: hh}, {x: -hw, y: hh}
             ];
             return cornersM.map(c => {
                 const rx = c.x * cos - c.y * sin;
                 const ry = c.x * sin + c.y * cos;
                 
                 return {
                     x: cx + rx * canvasPxPerMeterX,
                     y: cy + ry * canvasPxPerMeterY
                 };
             });
        };

        if (points.length >= 2) {
             const fieldCoordsPoints = points.map(p => getFieldCoordinates(p.x, p.y));
             const splinePoints = getCatmullRomSplinePoints(fieldCoordsPoints, 50);
             
             ctx.beginPath();
             ctx.strokeStyle = '#0088ff';
             ctx.lineWidth = 3;
             
             const getFieldCoordinatesInverse = (fx, fy) => {
                 const relX = fx / fieldConstants.width;
                 const relY = fy / fieldConstants.height;
                 
                 const imgX = crop.left + relX * crop.w;
                 const imgY = crop.bottom - relY * crop.h;
                 
                 return { x: imgX, y: imgY };
             };
             
             const startImg = getFieldCoordinatesInverse(splinePoints[0].x, splinePoints[0].y);
             ctx.moveTo(
                 (startImg.x - crop.x) * scaleX, 
                 (startImg.y - crop.y) * scaleY
             );
             
             for (let i = 1; i < splinePoints.length; i++) {
                 const pImg = getFieldCoordinatesInverse(splinePoints[i].x, splinePoints[i].y);
                 ctx.lineTo(
                     (pImg.x - crop.x) * scaleX, 
                     (pImg.y - crop.y) * scaleY
                 );
             }
             ctx.stroke();
             
             if (events.length > 0) {
                 const pathMetrics = calculatePathMetrics();
                 if (pathMetrics) {
                     const totalLength = pathMetrics.totalLength;
                     
                     const getPointAtDist = (dist) => {
                         let currentDist = 0;
                         for (let i = 0; i < splinePoints.length - 1; i++) {
                             const p1 = splinePoints[i];
                             const p2 = splinePoints[i+1];
                             const dx = p2.x - p1.x;
                             const dy = p2.y - p1.y;
                             const len = Math.sqrt(dx*dx + dy*dy);
                             
                             if (currentDist + len >= dist) {
                                 const t = (dist - currentDist) / len;
                                 return {
                                     x: p1.x + (p2.x - p1.x) * t,
                                     y: p1.y + (p2.y - p1.y) * t
                                 };
                             }
                             currentDist += len;
                         }
                         return splinePoints[splinePoints.length - 1];
                     };

                     events.forEach(ev => {
                         const targetDist = ev.t * totalLength;
                         const pos = getPointAtDist(targetDist);
                         
                         if (pos) {
                             const pImg = getFieldCoordinatesInverse(pos.x, pos.y);
                             const screenX = (pImg.x - crop.x) * scaleX;
                             const screenY = (pImg.y - crop.y) * scaleY;
                             
                             ctx.beginPath();
                            ctx.fillStyle = '#2e7d32';
                            ctx.arc(screenX, screenY, 6, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.strokeStyle = 'white';
                            ctx.lineWidth = 2;
                            ctx.stroke();
                            
                            ctx.fillStyle = '#2e7d32';
                            ctx.font = '12px Arial';
                            ctx.fillText(ev.name, screenX + 10, screenY - 10);
                         }
                     });
                 }
             }
        }

        points.forEach((p, i) => {
            if (p.x >= crop.left && p.x <= crop.right && p.y >= crop.top && p.y <= crop.bottom) {
                const canvasX = (p.x - crop.left) * scaleX;
                const canvasY = (p.y - crop.top) * scaleY;

                const bumperCorners = getCorners(canvasX, canvasY, robotSettings.width + 2 * robotSettings.bumper, robotSettings.height + 2 * robotSettings.bumper, p.rotation);
                const robotCorners = getCorners(canvasX, canvasY, robotSettings.width, robotSettings.height, p.rotation);
                
                ctx.fillStyle = 'rgba(211, 47, 47, 0.7)'; 
                ctx.beginPath();
                ctx.moveTo(bumperCorners[0].x, bumperCorners[0].y);
                bumperCorners.forEach((c, idx) => { if(idx>0) ctx.lineTo(c.x, c.y); });
                ctx.closePath();
                
                ctx.moveTo(robotCorners[0].x, robotCorners[0].y);
                robotCorners.forEach((c, idx) => { if(idx>0) ctx.lineTo(c.x, c.y); });
                ctx.closePath();
                
                ctx.fill('evenodd');

                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(robotCorners[0].x, robotCorners[0].y);
                robotCorners.forEach((c, idx) => { if(idx>0) ctx.lineTo(c.x, c.y); });
                ctx.closePath();
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(canvasX - 5, canvasY);
                ctx.lineTo(canvasX + 5, canvasY);
                ctx.moveTo(canvasX, canvasY - 5);
                ctx.lineTo(canvasX, canvasY + 5);
                ctx.strokeStyle = '#FF0000';
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(canvasX, canvasY, 2, 0, 2 * Math.PI);
                ctx.fillStyle = '#FF0000';
                ctx.fill();
                
                ctx.fillStyle = '#FF0000';
                ctx.font = 'bold 14px Arial';
                const labelX = Math.max(...bumperCorners.map(c => c.x)) + 5;
                const labelY = Math.min(...bumperCorners.map(c => c.y));
                ctx.fillText(`P${i + 1}`, labelX, labelY);

                const handleRadiusMeters = Math.max(robotSettings.width, robotSettings.height) / 2 + 0.5;
                const hOffX = Math.cos(p.rotation) * handleRadiusMeters * canvasPxPerMeterX;
                const hOffY = Math.sin(p.rotation) * handleRadiusMeters * canvasPxPerMeterY;
                const hCanvasX = canvasX + hOffX;
                const hCanvasY = canvasY + hOffY;

                ctx.beginPath();
                ctx.moveTo(canvasX, canvasY);
                ctx.lineTo(hCanvasX, hCanvasY);
                ctx.strokeStyle = '#2979FF';
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(hCanvasX, hCanvasY, 5, 0, 2 * Math.PI);
                ctx.fillStyle = '#2979FF';
                ctx.fill();
                
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.beginPath();
                ctx.moveTo(robotCorners[0].x, robotCorners[0].y);
                robotCorners.forEach((c, idx) => { if(idx>0) ctx.lineTo(c.x, c.y); });
                ctx.closePath();
                ctx.stroke();
                
                const frontOffX = (robotSettings.width/2 * Math.cos(p.rotation)) * canvasPxPerMeterX;
                const frontOffY = (robotSettings.width/2 * Math.sin(p.rotation)) * canvasPxPerMeterY;
                const canvasFrontX = canvasX + frontOffX;
                const canvasFrontY = canvasY + frontOffY;
                
                ctx.beginPath();
                ctx.moveTo(canvasX, canvasY);
                ctx.lineTo(canvasFrontX, canvasFrontY);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.stroke();
            }
        });

        if (robotPos && isPlaying) {
            const cx = (robotPos.x / fieldConstants.width) * canvas.width;
            const cy = canvas.height - (robotPos.y / fieldConstants.height) * canvas.height;

            const robotCorners = getCorners(cx, cy, robotSettings.width, robotSettings.height, robotHeading);
            const bumperCorners = getCorners(cx, cy, robotSettings.width + 2*robotSettings.bumper, robotSettings.height + 2*robotSettings.bumper, robotHeading);
            
            ctx.fillStyle = '#2e7d32'; 
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            ctx.moveTo(bumperCorners[0].x, bumperCorners[0].y);
            bumperCorners.forEach((c, idx) => { if(idx>0) ctx.lineTo(c.x, c.y); });
            ctx.closePath();
            ctx.fill();
            
            ctx.globalAlpha = 1.0;
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(robotCorners[0].x, robotCorners[0].y);
            robotCorners.forEach((c, idx) => { if(idx>0) ctx.lineTo(c.x, c.y); });
            ctx.closePath();
            ctx.stroke();
            
            const frontOffX = (robotSettings.width/2 * Math.cos(robotHeading)) * canvasPxPerMeterX;
            const frontOffY = (robotSettings.width/2 * Math.sin(robotHeading)) * canvasPxPerMeterY;
            const fx = cx + frontOffX;
            const fy = cy + frontOffY;

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(fx, fy);
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
}

function updatePointsList() {
    pointsList.innerHTML = '';
    
    let metrics = null;
    if (points.length >= 2) {
        metrics = calculatePathMetrics();
    }
    
    events.sort((a, b) => a.t - b.t);
    
    let currentDist = 0;
    let eventIndex = 0;

    points.forEach((p, i) => {
        const coords = getFieldCoordinates(p.x, p.y);
        const rotationDeg = (p.rotation * 180 / Math.PI).toFixed(1);
        
        const crop = getCropRect();
        const isVisible = (p.x >= crop.left && p.x <= crop.right && p.y >= crop.top && p.y <= crop.bottom);
        
        const li = document.createElement('li');
        if (!isVisible) li.style.opacity = '0.5';
        
        li.innerHTML = `
            <div style="display: flex; flex-direction: column;">
                <span>P${i + 1}: (${coords.x.toFixed(2)}, ${coords.y.toFixed(2)}) ${isVisible ? '' : '(Hidden)'}</span>
                <span style="font-size: 0.8em; color: #aaa;">Rot: ${rotationDeg}°</span>
            </div>
            <button class="delete-btn" onclick="deletePointAtIndex(${i})">X</button>
        `;
        pointsList.appendChild(li);

        if (metrics && i < points.length - 1) {
            const segLen = metrics.userSegmentLengths[i];
            const nextDist = currentDist + segLen;
            
            while(eventIndex < events.length) {
                const e = events[eventIndex];
                const eDist = e.t * metrics.totalLength;
                
                if (eDist >= currentDist && eDist < nextDist) {
                    const liEvent = document.createElement('li');
                    liEvent.style.borderLeft = "2px solid #2e7d32";
                    liEvent.style.backgroundColor = "#1a1a1a";
                    
                    let nameContent;
                    const isEditing = (eventIndex === editingEventIndex);

                    if (availableEvents.length > 0) {
                        if (isEditing) {
                            let optionsHtml = '';
                            if (!availableEvents.includes(e.name)) {
                                optionsHtml += `<option value="${e.name}" selected>${e.name}</option>`;
                            }
                            optionsHtml += availableEvents.map(opt => 
                                `<option value="${opt}" ${opt === e.name ? 'selected' : ''}>${opt}</option>`
                            ).join('');
                            
                            nameContent = `<select id="event-select-${eventIndex}" onchange="updateEventName(${eventIndex}, this.value)" onblur="cancelEditingEvent()" style="background: #333; color: white; border: 1px solid #555; padding: 2px; width: 100%;">${optionsHtml}</select>`;
                        } else {
                            nameContent = `<span style="color: #2e7d32; cursor: pointer; text-decoration: underline;" onclick="startEditingEvent(${eventIndex})" title="Click to edit">${e.name}</span>`;
                        }
                    } else {
                        nameContent = `<span style="color: #2e7d32;">Event: ${e.name}</span>`;
                    }

                    liEvent.innerHTML = `
                        <div style="display: flex; flex-direction: column; width: 100%;">
                            ${nameContent}
                            <span style="font-size: 0.8em; color: #aaa;">t: ${e.t.toFixed(4)}</span>
                        </div>
                        <button class="delete-btn" onclick="deleteEventAtIndex(${eventIndex})">X</button>
                    `;
                    pointsList.appendChild(liEvent);
                    eventIndex++;
                } else if (eDist < currentDist) {
                     eventIndex++;
                } else {
                    break;
                }
            }
            
            currentDist += segLen;
        }
    });

    if (metrics) {
         while(eventIndex < events.length) {
             const e = events[eventIndex];
             const liEvent = document.createElement('li');
             liEvent.style.borderLeft = "2px solid #2e7d32";
             liEvent.style.backgroundColor = "#1a1a1a";

             let nameContent;
             const isEditing = (eventIndex === editingEventIndex);

             if (availableEvents.length > 0) {
                 if (isEditing) {
                     let optionsHtml = '';
                     if (!availableEvents.includes(e.name)) {
                         optionsHtml += `<option value="${e.name}" selected>${e.name}</option>`;
                     }
                     optionsHtml += availableEvents.map(opt => 
                         `<option value="${opt}" ${opt === e.name ? 'selected' : ''}>${opt}</option>`
                     ).join('');
                     
                     nameContent = `<select id="event-select-${eventIndex}" onchange="updateEventName(${eventIndex}, this.value)" onblur="cancelEditingEvent()" style="background: #333; color: white; border: 1px solid #555; padding: 2px; width: 100%;">${optionsHtml}</select>`;
                 } else {
                     nameContent = `<span style="color: #2e7d32; cursor: pointer; text-decoration: underline;" onclick="startEditingEvent(${eventIndex})" title="Click to edit">${e.name}</span>`;
                 }
             } else {
                 nameContent = `<span style="color: #2e7d32;">Event: ${e.name}</span>`;
             }

             liEvent.innerHTML = `
                <div style="display: flex; flex-direction: column; width: 100%;">
                    ${nameContent}
                    <span style="font-size: 0.8em; color: #aaa;">t: ${e.t.toFixed(4)}</span>
                </div>
                <button class="delete-btn" onclick="deleteEventAtIndex(${eventIndex})">X</button>
            `;
            pointsList.appendChild(liEvent);
            eventIndex++;
         }
    }
}

window.startEditingEvent = (index) => {
    editingEventIndex = index;
    updatePointsList();
    setTimeout(() => {
        const select = document.getElementById(`event-select-${index}`);
        if (select) select.focus();
    }, 10);
};

window.cancelEditingEvent = () => {
    setTimeout(() => {
        editingEventIndex = -1;
        updatePointsList();
    }, 200);
};

window.deletePointAtIndex = (index) => {
    points.splice(index, 1);
    draw();
    updatePointsList();
};

window.deleteEventAtIndex = (index) => {
    events.splice(index, 1);
    updatePointsList();
    draw();
};

window.updateEventName = (index, newName) => {
    if (events[index]) {
        events[index].name = newName;
        editingEventIndex = -1;
        draw(); 
        updatePointsList();
    }
};

window.addEventListener('resize', () => {
    draw();
});
