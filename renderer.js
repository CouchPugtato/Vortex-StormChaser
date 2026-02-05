const canvas = document.getElementById('fieldCanvas');
const ctx = canvas.getContext('2d');

const btnLoad = document.getElementById('btnLoad');
const btnExport = document.getElementById('btnExport');
const btnClear = document.getElementById('btnClear');
const btnToggleCrop = document.getElementById('btnToggleCrop');
const cropSlidersDiv = document.getElementById('cropSliders');
const btnToggleRobot = document.getElementById('btnToggleRobot');
const robotSettingsDiv = document.getElementById('robotSettings');
const statusDiv = document.getElementById('status');
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
    bumper: document.getElementById('robotBumper')
};

const valLabels = {
    left: document.getElementById('valLeft'),
    right: document.getElementById('valRight'),
    top: document.getElementById('valTop'),
    bottom: document.getElementById('valBottom')
};

let currentImage = null;
let points = [];
let fieldConstants = {
    width: 16.541,
    height: 8.067
};

const METERS_PER_INCH = 0.0254;

let robotSettings = {
    width: 28 * METERS_PER_INCH,
    height: 28 * METERS_PER_INCH,
    bumper: 3 * METERS_PER_INCH
};

let isUpdatingSliders = false;
let saveSettingsTimeout = null;
let isDraggingCrop = false;
let isDraggingPoint = false;
let draggingPointIndex = -1;
let dragStart = { x: 0, y: 0 };

(async () => {
    const defaultPath = await window.electronAPI.getDefaultImage();
    if (defaultPath) {
        loadImage(defaultPath);
    } else {
        statusDiv.innerText = "Ready to load image.";
    }
})();

btnLoad.addEventListener('click', async () => {
    const filePath = await window.electronAPI.openFile();
    if (filePath) {
        loadImage(filePath);
    }
});

btnToggleCrop.addEventListener('click', () => {
    const isHidden = cropSlidersDiv.classList.contains('hidden');
    if (isHidden) {
        cropSlidersDiv.classList.remove('hidden');
        btnToggleCrop.innerText = "Hide Crop Controls";
    } else {
        cropSlidersDiv.classList.add('hidden');
        btnToggleCrop.innerText = "Change Crop";
        saveSettings();
    }
    draw();
});

btnToggleRobot.addEventListener('click', () => {
    const isHidden = robotSettingsDiv.classList.contains('hidden');
    if (isHidden) {
        robotSettingsDiv.classList.remove('hidden');
        btnToggleRobot.innerText = "Hide Robot Settings";
    } else {
        robotSettingsDiv.classList.add('hidden');
        btnToggleRobot.innerText = "Robot Settings";
        saveSettings();
    }
});

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

btnExport.addEventListener('click', async () => {
    if (points.length === 0) return;
    
    const exportData = points.map((p, i) => {
        const coords = getFieldCoordinates(p.x, p.y);
        return {
            id: i + 1,
            x: Number(coords.x.toFixed(4)),
            y: Number(coords.y.toFixed(4))
        };
    });

    const success = await window.electronAPI.saveFile(JSON.stringify(exportData, null, 4));
    if (success) {
        alert('Points exported successfully!');
    }
});

btnClear.addEventListener('click', () => {
    points = [];
    draw();
    updatePointsList();
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
            const closestIdx = findClosestPointIndex(imgX, imgY);
            if (closestIdx !== -1) {
                isDraggingPoint = true;
                draggingPointIndex = closestIdx;
            } else {
                addPoint(imgX, imgY);
            }
        }
    }
});

window.addEventListener('mousemove', (e) => {
    if ((!isDraggingCrop && !isDraggingPoint) || !currentImage) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isDraggingPoint) {
        const crop = getCropRect();
        const scaleX = canvas.width / crop.w;
        const scaleY = canvas.height / crop.h;
        
        const imgX = crop.x + (mouseX / scaleX);
        const imgY = crop.y + (mouseY / scaleY);

        points[draggingPointIndex].x = imgX;
        points[draggingPointIndex].y = imgY;
        
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
    draggingPointIndex = -1;
});

canvas.addEventListener('contextmenu', (e) => {
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
    
    deleteClosestPoint(imgX, imgY);
});

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
        robotInputs.width.value = (robotSettings.width / METERS_PER_INCH).toFixed(1);
        robotInputs.height.value = (robotSettings.height / METERS_PER_INCH).toFixed(1);
        robotInputs.bumper.value = (robotSettings.bumper / METERS_PER_INCH).toFixed(1);
    }
    console.log("Loaded settings:", settings);
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
        statusDiv.innerText = `Loaded: ${src.split(/[\\/]/).pop()}`;
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
            bumper: robotSettings.bumper
        }
    };
    window.electronAPI.saveSettings(settings);
}

function addPoint(x, y) {
    points.push({ x, y });
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

function draw() {
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

        const pxPerMeterX = canvas.width / fieldConstants.width;
        const pxPerMeterY = canvas.height / fieldConstants.height;
        const robotW = robotSettings.width * pxPerMeterX;
        const robotH = robotSettings.height * pxPerMeterY;
        const bumperPxX = robotSettings.bumper * pxPerMeterX;
        const bumperPxY = robotSettings.bumper * pxPerMeterY;

        const canvasPoints = points.map(p => ({
            x: (p.x - crop.left) * scaleX,
            y: (p.y - crop.top) * scaleY
        }));

        if (canvasPoints.length > 1) {
            ctx.beginPath();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#FFA500';
            ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);

            for (let i = 0; i < canvasPoints.length - 1; i++) {
                const p0 = canvasPoints[i === 0 ? 0 : i - 1];
                const p1 = canvasPoints[i];
                const p2 = canvasPoints[i + 1];
                const p3 = canvasPoints[i + 2 >= canvasPoints.length ? canvasPoints.length - 1 : i + 2];

                const cp1x = p1.x + (p2.x - p0.x) / 6;
                const cp1y = p1.y + (p2.y - p0.y) / 6;
                const cp2x = p2.x - (p3.x - p1.x) / 6;
                const cp2y = p2.y - (p3.y - p1.y) / 6;

                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
            }
            ctx.stroke();
        }

        points.forEach((p, i) => {
            if (p.x >= crop.left && p.x <= crop.right && p.y >= crop.top && p.y <= crop.bottom) {
                const canvasX = (p.x - crop.left) * scaleX;
                const canvasY = (p.y - crop.top) * scaleY;

                ctx.fillStyle = '#D32F2F';
                ctx.globalAlpha = 0.7;
                ctx.fillRect(
                    canvasX - robotW / 2 - bumperPxX, 
                    canvasY - robotH / 2 - bumperPxY, 
                    robotW + 2 * bumperPxX, 
                    robotH + 2 * bumperPxY
                );
                ctx.globalAlpha = 1.0;

                ctx.strokeStyle = '#0000FF';
                ctx.lineWidth = 2;
                ctx.strokeRect(canvasX - robotW / 2, canvasY - robotH / 2, robotW, robotH);

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
                ctx.fillText(`P${i + 1}`, canvasX + robotW / 2 + bumperPxX + 5, canvasY - robotH / 2);
            }
        });
    }
}

function updatePointsList() {
    pointsList.innerHTML = '';
    
    points.forEach((p, i) => {
        const coords = getFieldCoordinates(p.x, p.y);
        
        const crop = getCropRect();
        const isVisible = (p.x >= crop.left && p.x <= crop.right && p.y >= crop.top && p.y <= crop.bottom);
        
        const li = document.createElement('li');
        if (!isVisible) li.style.opacity = '0.5';
        
        li.innerHTML = `
            <span>P${i + 1}: (${coords.x.toFixed(3)}, ${coords.y.toFixed(3)}) ${isVisible ? '' : '(Hidden)'}</span>
            <button class="delete-btn" onclick="deletePointAtIndex(${i})">X</button>
        `;
        pointsList.appendChild(li);
    });
}

window.deletePointAtIndex = (index) => {
    points.splice(index, 1);
    draw();
    updatePointsList();
};

window.addEventListener('resize', () => {
    draw();
});
