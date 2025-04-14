const video = document.getElementById('webcam');
const liveView = document.getElementById('liveView');
const demosSection = document.getElementById('demos');
const webcamButton = document.getElementById('webcamButton');
const statusDiv = document.getElementById('status');


// Configuration
const MIN_CONFIDENCE = 0.7;
const COLOR_SAMPLING_RATE = 0.3; // Échantillonnage des pixels
let model = null;
let children = [];

// Initialisation du modèle
async function initializeModel() {
    statusDiv.textContent = 'Chargement du modèle...';
    try {
        model = await cocoSsd.load();
        demosSection.classList.remove('invisible');
        statusDiv.textContent = 'Prêt à détecter';
        webcamButton.disabled = false;
    } catch (error) {
        statusDiv.textContent = 'Erreur de chargement du modèle';
        console.error(error);
    }
}

// Activation de la webcam
async function enableCam() {
    webcamButton.disabled = true;
    statusDiv.textContent = 'Activation de la webcam...';

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 }
        });
        video.srcObject = stream;
        video.addEventListener('loadeddata', startDetection);
    } catch (error) {
        statusDiv.textContent = 'Erreur d\'accès à la webcam';
        console.error(error);
    }
}

// Détection en temps réel
async function startDetection() {
    statusDiv.textContent = 'Détection en cours...';
    video.width = video.videoWidth;
    video.height = video.videoHeight;

    async function detectionLoop() {
        if (!model) return;

        const predictions = await model.detect(video);
        updateDetections(predictions);
        requestAnimationFrame(detectionLoop);
    }

    detectionLoop();
}

// Mise à jour des détections
function updateDetections(predictions) {
    // Nettoyer les anciennes détections
    children.forEach(child => child.remove());
    children = [];

    predictions.forEach(prediction => {
        if (prediction.class === 'car' && prediction.score >= MIN_CONFIDENCE) {
            const [x, y, width, height] = prediction.bbox;
            createDetectionElements(x, y, width, height, prediction.score);
        }
    });
}

// Création des éléments visuels
function createDetectionElements(x, y, width, height, score) {
    // Analyse de la couleur
    const color = getDominantColor(x, y, width, height);

    // Création du cadre
    const box = document.createElement('div');
    box.className = 'detection-box';
    box.style = `left: ${x}px; top: ${y}px; width: ${width}px; height: ${height}px;`;

    // Création du label
    const label = document.createElement('div');
    label.className = 'detection-label';
    label.textContent = `Voiture (${Math.round(score * 100)}%) - ${color}`;
    label.style = `left: ${x}px; top: ${y}px;`;

    liveView.appendChild(box);
    liveView.appendChild(label);
    children.push(box, label);
}

// Analyse de couleur améliorée
function getDominantColor(x, y, width, height) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = width;
    canvas.height = height;

    ctx.drawImage(video, x, y, width, height, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const color = analyzeColor(imageData.data);

    return color;
}

function analyzeColor(data) {
    let rTotal = 0, gTotal = 0, bTotal = 0;
    let sampleCount = Math.floor(data.length * COLOR_SAMPLING_RATE / 4);

    for (let i = 0; i < data.length; i += 4 * (1/COLOR_SAMPLING_RATE)) {
        rTotal += data[i];
        gTotal += data[i + 1];
        bTotal += data[i + 2];
    }

    const r = Math.round(rTotal / sampleCount);
    const g = Math.round(gTotal / sampleCount);
    const b = Math.round(bTotal / sampleCount);

    return getColorName(r, g, b);
}

// Système de reconnaissance de couleurs amélioré
function getColorName(r, g, b) {
    const hsv = rgbToHsv(r, g, b);
    const hue = hsv.h * 360;
    const saturation = hsv.s * 100;
    const value = hsv.v * 100;

    // Détection des niveaux de gris
    if (saturation < 15) {
        if (value < 20) return 'Noir';
        if (value > 80) return 'Blanc';
        if (value > 50) return 'Gris clair';
        return 'Gris foncé';
    }

    // Détection des couleurs principales avec plages élargies
    if (hue >= 340 || hue < 10) return 'Rouge';
    if (hue >= 10 && hue < 40) return 'Orange-Rouge';
    if (hue >= 40 && hue < 50) return 'Orange';
    if (hue >= 50 && hue < 70) return 'Jaune-Orange';
    if (hue >= 70 && hue < 85) return 'Jaune';
    if (hue >= 85 && hue < 160) return 'Vert';
    if (hue >= 160 && hue < 180) return 'Turquoise';
    if (hue >= 180 && hue < 240) return 'Bleu';
    if (hue >= 240 && hue < 280) return 'Bleu-Violet';
    if (hue >= 280 && hue < 320) return 'Violet';
    if (hue >= 320 && hue < 340) return 'Rose';

    return 'Couleur complexe';
}

function rgbToHsv(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;

    if (max === min) {
        h = 0;
    } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return { h, s, v };
}

// Détection de couleurs multiples
function detectMultipleColors(imageData) {
    const colorZones = [];
    const gridSize = 3; // Découpage en 3x3 grille

    const zoneWidth = Math.floor(imageData.width / gridSize);
    const zoneHeight = Math.floor(imageData.height / gridSize);

    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const startX = i * zoneWidth;
            const startY = j * zoneHeight;
            const zoneData = getZoneData(imageData, startX, startY, zoneWidth, zoneHeight);
            const color = getColorName(...getDominantColorFromData(zoneData));
            colorZones.push(color);
        }
    }

    return Array.from(new Set(colorZones)); // Retourne les couleurs uniques
}

function getZoneData(imageData, x, y, width, height) {
    const data = [];
    for (let i = y; i < y + height; i++) {
        for (let j = x; j < x + width; j++) {
            const idx = (i * imageData.width + j) * 4;
            data.push(...imageData.data.slice(idx, idx + 4));
        }
    }
    return new ImageData(new Uint8ClampedArray(data), width, height);
}

function getDominantColorFromData(imageData) {
    let rTotal = 0, gTotal = 0, bTotal = 0;
    let sampleCount = 0;

    for (let i = 0; i < imageData.data.length; i += 4 * Math.floor(1/COLOR_SAMPLING_RATE)) {
        rTotal += imageData.data[i];
        gTotal += imageData.data[i + 1];
        bTotal += imageData.data[i + 2];
        sampleCount++;
    }

    return [
        Math.round(rTotal / sampleCount),
        Math.round(gTotal / sampleCount),
        Math.round(bTotal / sampleCount)
    ];
}

// Modification de createDetectionElements
function createDetectionElements(x, y, width, height, score) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = width;
    canvas.height = height;

    ctx.drawImage(video, x, y, width, height, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);

    // Détection multi-couleurs
    const colors = detectMultipleColors(imageData);
    const mainColor = getColorName(...getDominantColorFromData(imageData));

    const box = document.createElement('div');
    box.className = 'detection-box';
    box.style = `left: ${x}px; top: ${y}px; width: ${width}px; height: ${height}px;`;

    const label = document.createElement('div');
    label.className = 'detection-label';
    label.textContent = `Voiture (${Math.round(score * 100)}%) - Couleurs: ${colors.join(', ')}`;
    label.style = `left: ${x}px; top: ${y}px;`;

    liveView.appendChild(box);
    liveView.appendChild(label);
    children.push(box, label);
}

// Initialisation
webcamButton.addEventListener('click', enableCam);
initializeModel();