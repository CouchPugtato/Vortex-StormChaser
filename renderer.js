const canvas = document.getElementById('fieldCanvas');
const ctx = canvas.getContext('2d');

const btnLoad = document.getElementById('btnLoad');
const btnExport = document.getElementById('btnExport');
const btnClear = document.getElementById('btnClear');
const btnToggleCrop = document.getElementById('btnToggleCrop');
const cropSlidersDiv = document.getElementById('cropSliders');
const statusDiv = document.getElementById('status');
const pointsList = document.getElementById('pointsList');

const sliders = {
    left: document.getElementById('sliderLeft'),
    right: document.getElementById('sliderRight'),
    top: document.getElementById('sliderTop'),
    bottom: document.getElementById('sliderBottom')
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
    }
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

    const crop = getCropRect();
    
    const scaleX = canvas.width / crop.w;
    const scaleY = canvas.height / crop.h;
    
    const imgX = crop.x + (mouseX / scaleX);
    const imgY = crop.y + (mouseY / scaleY);
    
    if (e.button === 0) {
        addPoint(imgX, imgY);
    }
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
        valLabels[key].innerText = e.target.value;
        draw();
        updatePointsList(); 
    });
});

function loadImage(src) {
    const img = new Image();
    img.onload = () => {
        currentImage = img;
        
        sliders.left.max = img.width;
        sliders.right.max = img.width;
        sliders.top.max = img.height;
        sliders.bottom.max = img.height;
        
        sliders.left.value = 0;
        sliders.right.value = img.width;
        sliders.top.value = 0;
        sliders.bottom.value = img.height;
        
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
        valLabels[key].innerText = sliders[key].value;
    });
}

function addPoint(x, y) {
    points.push({ x, y });
    draw();
    updatePointsList();
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
    const x1 = parseInt(sliders.left.value);
    const x2 = parseInt(sliders.right.value);
    const y1 = parseInt(sliders.top.value);
    const y2 = parseInt(sliders.bottom.value);
    
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
    if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const crop = getCropRect();
    
    ctx.drawImage(
        currentImage, 
        crop.x, crop.y, crop.w, crop.h,
        0, 0, canvas.width, canvas.height
    );
    
    const scaleX = canvas.width / crop.w;
    const scaleY = canvas.height / crop.h;

    points.forEach((p, i) => {
        if (p.x >= crop.left && p.x <= crop.right && p.y >= crop.top && p.y <= crop.bottom) {
            const canvasX = (p.x - crop.left) * scaleX;
            const canvasY = (p.y - crop.top) * scaleY;

            ctx.beginPath();
            ctx.arc(canvasX, canvasY, 6, 0, 2 * Math.PI);
            ctx.fillStyle = '#0000FF'; 
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.fillStyle = '#0000FF';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(`P${i + 1}`, canvasX + 10, canvasY - 10);
        }
    });
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
