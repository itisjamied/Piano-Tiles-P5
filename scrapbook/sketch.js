let video;
let bodyPose;
let poses = [];
let bodyPartImages = {};


let videoToggle;
let showVideo = true;

// shape mode toggle
let shapeModeToggle;
let useShapeMode = false;
let exportButton;

// dimension tracking
let dimensionHistory = [];
const MAX_HISTORY_FRAMES = 300;
let dimensionStats = {};

// multi-person tracking
let trackedPeople = {};
let nextPersonId = 0;

const KEYPOINT_NAMES = [
  "nose",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle"
];

const BODY_PARTS = [
  { name: "head", image: "head", points: ["nose", "left_shoulder", "right_shoulder"] },
  { name: "chest", image: "chest", points: ["left_shoulder", "right_shoulder", "left_hip", "right_hip"] },
  { name: "left-shoulder", image: "left-shoulder", points: ["left_shoulder", "left_elbow"] },
  { name: "right-shoulder", image: "right-shoulder", points: ["right_shoulder", "right_elbow"] },
  { name: "left-arm", image: "left-arm", points: ["left_elbow", "left_wrist"] },
  { name: "right-arm", image: "right-arm", points: ["right_elbow", "right_wrist"] },
  { name: "left-thigh", image: "left-thigh", points: ["left_hip", "left_knee"] },
  { name: "right-thigh", image: "right-thigh", points: ["right_hip", "right_knee"] },
  { name: "left-leg", image: "left-leg", points: ["left_knee", "left_ankle"] },
  { name: "right-leg", image: "right-leg", points: ["right_knee", "right_ankle"] }
];

// Color mapping for shape mode
const BODY_PART_COLORS = {
  "head": [255, 50, 50],          // red
  "chest": [50, 100, 255],        // blue
  "left-shoulder": [50, 200, 50], // green
  "right-shoulder": [50, 200, 50], // green
  "left-arm": [255, 200, 50],     // yellow
  "right-arm": [255, 200, 50],    // yellow
  "left-thigh": [200, 50, 200],   // purple
  "right-thigh": [200, 50, 200],  // purple
  "left-leg": [255, 120, 50],     // orange
  "right-leg": [255, 120, 50]     // orange
};

// tuning
const SMOOTHING = 0.25;
const MATCH_DISTANCE = 180;   // max px to match same person
const MAX_MISSING_FRAMES = 20;
const MAX_TRACKED_PEOPLE = 5;
const MIN_CONFIDENCE = 0.2;

function preload() {
  bodyPose = ml5.bodyPose("MoveNet", { flipped: true });

  // Right limb images are mirrored from left at render time.
  // Only 6 image files are required: head, chest,
  // left-shoulder, left-arm, left-thigh, left-leg.

  // Load unique images
  bodyPartImages["head"] = loadImage(`temp/head.png`);
  bodyPartImages["chest"] = loadImage(`temp/chest.png`);
  bodyPartImages["left-shoulder"] = loadImage(`temp/left-shoulder.png`);
  bodyPartImages["left-arm"] = loadImage(`temp/left-arm.png`);
  bodyPartImages["left-thigh"] = loadImage(`temp/left-thigh.png`);
  bodyPartImages["left-leg"] = loadImage(`temp/left-leg.png`);

  // Alias right-side limbs to their left counterparts (will be flipped at render)
  bodyPartImages["right-shoulder"] = bodyPartImages["left-shoulder"];
  bodyPartImages["right-arm"] = bodyPartImages["left-arm"];
  bodyPartImages["right-thigh"] = bodyPartImages["left-thigh"];
  bodyPartImages["right-leg"] = bodyPartImages["left-leg"];
}

function mousePressed() {
  console.log("poses", poses);
  console.log("trackedPeople", trackedPeople);
}

function gotPoses(results) {
  poses = results;
}

function setup() {
  createCanvas(1480, 1100);

  video = createCapture(VIDEO, { flipped: true });
  video.size(width, height);
  video.hide();

  bodyPose.detectStart(video, gotPoses);

  // Video toggle
  videoToggle = createCheckbox(" Show video", true);
  videoToggle.parent("checkboxContainer");
  videoToggle.style("color", "white");
  videoToggle.style("font-size", "18px");
  videoToggle.style("display", "block");
  videoToggle.style("margin-bottom", "10px");
  videoToggle.changed(() => {
    showVideo = videoToggle.checked();
  });

  // Shape mode toggle
  shapeModeToggle = createCheckbox(" Use Shapes (Debug Mode)", false);
  shapeModeToggle.parent("checkboxContainer");
  shapeModeToggle.style("color", "white");
  shapeModeToggle.style("font-size", "18px");
  shapeModeToggle.style("display", "block");
  shapeModeToggle.style("margin-bottom", "10px");
  shapeModeToggle.changed(() => {
    useShapeMode = shapeModeToggle.checked();
    if (!useShapeMode) {
      // Clear dimension history when toggling off
      dimensionHistory = [];
      dimensionStats = {};
    }
  });

  // Export button
  exportButton = createButton("Export Dimension Report");
  exportButton.parent("checkboxContainer");
  exportButton.style("font-size", "16px");
  exportButton.mousePressed(exportDimensionReport);
}

function draw() {
  background(0);

  if (showVideo) {
    image(video, 0, 0, width, height);
  }

  // update tracking from current detections
  updateTrackedPeople();

  // draw all tracked scrapbook bodies
  for (let id in trackedPeople) {
    drawScrapbookBody(trackedPeople[id], id);
  }

  drawTrackerLabels();

  // draw dimension panel if in shape mode
  drawDimensionPanel();
}

/* =========================
   MULTI-PERSON TRACKING
========================= */

function updateTrackedPeople() {
  let detections = [];

  // build usable detections
  for (let pose of poses) {
    let center = getPoseCenter(pose);
    if (!center) continue;

    let bodySize = getPoseSize(pose);

    detections.push({
      pose,
      center,
      bodySize,
      matched: false
    });
  }

  // keep only the biggest / most useful few if lots of people appear
  detections.sort((a, b) => b.bodySize - a.bodySize);
  detections = detections.slice(0, MAX_TRACKED_PEOPLE);

  let trackedIds = Object.keys(trackedPeople);
  let usedTrackIds = new Set();

  // match each detection to nearest tracked person
  for (let detection of detections) {
    let bestId = null;
    let bestDist = Infinity;

    for (let id of trackedIds) {
      if (usedTrackIds.has(id)) continue;

      let tracked = trackedPeople[id];
      let d = dist(
        detection.center.x,
        detection.center.y,
        tracked.center.x,
        tracked.center.y
      );

      if (d < bestDist && d < MATCH_DISTANCE) {
        bestDist = d;
        bestId = id;
      }
    }

    if (bestId !== null) {
      // update existing tracked person
      updateTrackedPerson(trackedPeople[bestId], detection.pose, detection.center);
      usedTrackIds.add(bestId);
      detection.matched = true;
    }
  }

  // any unmatched detections become new tracked people
  for (let detection of detections) {
    if (!detection.matched) {
      createTrackedPerson(detection.pose, detection.center);
    }
  }

  // remove stale tracked people
  for (let id in trackedPeople) {
    let tracked = trackedPeople[id];
    if (frameCount - tracked.lastSeen > MAX_MISSING_FRAMES) {
      delete trackedPeople[id];
    }
  }
}

function createTrackedPerson(pose, center) {
  let id = String(nextPersonId++);
  let smoothPoints = {};

  for (let name of KEYPOINT_NAMES) {
    let pt = pose[name];
    if (isGoodPoint(pt)) {
      smoothPoints[name] = createVector(pt.x, pt.y);
    }
  }

  trackedPeople[id] = {
    id,
    smoothPoints,
    center: createVector(center.x, center.y),
    lastSeen: frameCount,
    accent: random(360)
  };
}

function updateTrackedPerson(person, pose, newCenter) {
  person.center.x = lerp(person.center.x, newCenter.x, 0.3);
  person.center.y = lerp(person.center.y, newCenter.y, 0.3);
  person.lastSeen = frameCount;

  for (let name of KEYPOINT_NAMES) {
    let pt = pose[name];
    if (!isGoodPoint(pt)) continue;

    if (!person.smoothPoints[name]) {
      person.smoothPoints[name] = createVector(pt.x, pt.y);
    } else {
      person.smoothPoints[name].x = lerp(person.smoothPoints[name].x, pt.x, SMOOTHING);
      person.smoothPoints[name].y = lerp(person.smoothPoints[name].y, pt.y, SMOOTHING);
    }
  }
}

function isGoodPoint(point) {
  if (!point) return false;
  if (point.confidence !== undefined && point.confidence < MIN_CONFIDENCE) return false;
  return true;
}

function getPoseCenter(pose) {
  let pts = [
    pose.left_shoulder,
    pose.right_shoulder,
    pose.left_hip,
    pose.right_hip
  ];

  let valid = pts.filter(isGoodPoint);
  if (valid.length < 2) return null;

  let sumX = 0;
  let sumY = 0;

  for (let p of valid) {
    sumX += p.x;
    sumY += p.y;
  }

  return createVector(sumX / valid.length, sumY / valid.length);
}

function getPoseSize(pose) {
  let ls = pose.left_shoulder;
  let rs = pose.right_shoulder;
  let lh = pose.left_hip;
  let rh = pose.right_hip;

  let size = 0;

  if (isGoodPoint(ls) && isGoodPoint(rs)) {
    size += dist(ls.x, ls.y, rs.x, rs.y);
  }

  if (isGoodPoint(lh) && isGoodPoint(rh)) {
    size += dist(lh.x, lh.y, rh.x, rh.y);
  }

  return size;
}

/* =========================
   DRAWING
========================= */

function drawScrapbookBody(person, id) {
  let nose = getPoint(person, "nose");
  let leftShoulder = getPoint(person, "left_shoulder");
  let rightShoulder = getPoint(person, "right_shoulder");
  let leftElbow = getPoint(person, "left_elbow");
  let rightElbow = getPoint(person, "right_elbow");
  let leftWrist = getPoint(person, "left_wrist");
  let rightWrist = getPoint(person, "right_wrist");
  let leftHip = getPoint(person, "left_hip");
  let rightHip = getPoint(person, "right_hip");
  let leftKnee = getPoint(person, "left_knee");
  let rightKnee = getPoint(person, "right_knee");
  let leftAnkle = getPoint(person, "left_ankle");
  let rightAnkle = getPoint(person, "right_ankle");

  if (
    !nose ||
    !leftShoulder || !rightShoulder ||
    !leftHip || !rightHip ||
    !leftElbow || !rightElbow ||
    !leftWrist || !rightWrist ||
    !leftKnee || !rightKnee ||
    !leftAnkle || !rightAnkle
  ) {
    return;
  }

  let shoulderCenter = midpoint(leftShoulder, rightShoulder);
  let hipCenter = midpoint(leftHip, rightHip);

  let shoulderWidth = dist(
    leftShoulder.x, leftShoulder.y,
    rightShoulder.x, rightShoulder.y
  );

  // let headSize = shoulderWidth * 0.75;
  // let handSize = shoulderWidth * 0.22;
  // let footSize = shoulderWidth * 0.28;
  // let limbThickness = shoulderWidth * 0.22;
  // let torsoWidth = shoulderWidth * 0.9;

  colorMode(HSL);

  // fill((person.accent + 60) % 360, 70, 65, 0.75);
  // drawLimbRect(leftShoulder, leftElbow, limbThickness);
  // drawLimbRect(leftElbow, leftWrist, limbThickness * 0.9);

  // fill((person.accent + 120) % 360, 70, 65, 0.75);
  // drawLimbRect(rightShoulder, rightElbow, limbThickness);
  // drawLimbRect(rightElbow, rightWrist, limbThickness * 0.9);

  // fill((person.accent + 180) % 360, 70, 65, 0.75);
  // drawLimbRect(leftHip, leftKnee, limbThickness * 1.1);
  // drawLimbRect(leftKnee, leftAnkle, limbThickness);


  // fill((person.accent + 240) % 360, 70, 65, 0.75);
  // drawLimbRect(rightHip, rightKnee, limbThickness * 1.1);
  // drawLimbRect(rightKnee, rightAnkle, limbThickness);

  // fill(person.accent, 70, 65, 0.7);
  // drawLimbRect(shoulderCenter, hipCenter, torsoWidth);


  // fill((person.accent + 30) % 360, 70, 75, 0.85);
  // stroke(255);
  // strokeWeight(2);
  // circle(nose.x, nose.y, headSize);



  // Render body parts (either images or shapes based on mode)
  if (useShapeMode) {
    // In shape mode, use normalized scale factors to show true skeletal proportions
    drawBodyShape(bodyPartImages["left-arm"], leftElbow, leftWrist, "left-arm", id, 0.8);
    drawBodyShape(bodyPartImages["left-shoulder"], leftShoulder, leftElbow, "left-shoulder", id, 0.8);

    drawBodyShape(bodyPartImages["right-arm"], rightElbow, rightWrist, "right-arm", id, 0.8);
    drawBodyShape(bodyPartImages["right-shoulder"], rightShoulder, rightElbow, "right-shoulder", id, 0.8);

    drawBodyShape(bodyPartImages["left-leg"], leftKnee, leftAnkle, "left-leg", id, 0.8);
    drawBodyShape(bodyPartImages["left-thigh"], leftHip, leftKnee, "left-thigh", id, 0.8);

    drawBodyShape(bodyPartImages["right-leg"], rightKnee, rightAnkle, "right-leg", id, 0.8);
    drawBodyShape(bodyPartImages["right-thigh"], rightHip, rightKnee, "right-thigh", id, 0.8);

    drawBodyShape(bodyPartImages["chest"], shoulderCenter, hipCenter, "chest", id, 0.8);

    drawBodyShape(bodyPartImages["head"], nose, shoulderCenter, "head", id, 1.2, 0.25);
  } else {
    // In image mode, use artistic scale factors for collage effect
    drawBodyImage(bodyPartImages["left-arm"], leftElbow, leftWrist, .8, 0, false);
    drawBodyImage(bodyPartImages["left-shoulder"], leftShoulder, leftElbow, .5, 0, false);

    drawBodyImage(bodyPartImages["right-arm"], rightElbow, rightWrist, .8, 0, true);
    drawBodyImage(bodyPartImages["right-shoulder"], rightShoulder, rightElbow, .5, 0, true);

    drawBodyImage(bodyPartImages["left-leg"], leftKnee, leftAnkle, .4, 0, false);
    drawBodyImage(bodyPartImages["left-thigh"], leftHip, leftKnee, .4, 0, false);

    drawBodyImage(bodyPartImages["right-leg"], rightKnee, rightAnkle, .4, 0, true);
    drawBodyImage(bodyPartImages["right-thigh"], rightHip, rightKnee, .4, 0, true);

    drawBodyImage(bodyPartImages["chest"], shoulderCenter, hipCenter, .8, 0, false);

    // Adjust head position up by 10px
    let adjustedNose = createVector(nose.x, nose.y - 10);
    drawBodyImage(bodyPartImages["head"], adjustedNose, shoulderCenter, 1.2, 0, false);
  }



  // optional joint dots
  drawJointDots(person);

  colorMode(RGB);
}

function drawLimbRect(a, b, thickness) {
  let mid = midpoint(a, b);
  let len = dist(a.x, a.y, b.x, b.y);
  let angle = atan2(b.y - a.y, b.x - a.x);

  push();
  translate(mid.x, mid.y);
  rotate(angle);
  rectMode(CENTER);
  stroke(255);
  strokeWeight(2);
  rect(0, 0, len, thickness, thickness * 0.55);
  pop();
}

function midpoint(a, b) {
  return createVector((a.x + b.x) / 2, (a.y + b.y) / 2);
}

function getPoint(person, name) {
  return person.smoothPoints[name];
}

function drawJointDots(person) {
  fill(255);
  noStroke();

  for (let key in person.smoothPoints) {
    let p = person.smoothPoints[key];
    circle(p.x, p.y, 6);
  }
}

function drawTrackerLabels() {
  fill(255);
  noStroke();
  textSize(16);

  for (let id in trackedPeople) {
    let tracked = trackedPeople[id];
    text(`ID ${id}`, tracked.center.x + 10, tracked.center.y - 10);
  }
}

function drawBodyImage(img, a, b, scaleFactor = 1, offsetY = 0, flipped = false) {
  if (!img || !a || !b) return;

  let mid = midpoint(a, b);
  let len = dist(a.x, a.y, b.x, b.y);
  let angle = atan2(b.y - a.y, b.x - a.x);

  // preserve original image proportions
  let aspect = img.height / img.width;

  let drawWidth = len * scaleFactor;
  let drawHeight = drawWidth * aspect;

  push();
  translate(mid.x, mid.y);
  rotate(angle - PI / 2);

  // Apply horizontal flip for right-side limbs (after rotation)
  if (flipped) {
    scale(-1, 1);
  }

  // translate(0, -drawHeight * offsetY);

  imageMode(CENTER);

  image(img, 0, 0, drawWidth, drawHeight);

  pop();

  return { width: drawWidth, height: drawHeight, aspect: aspect };
}

function drawBodyShape(img, a, b, partName, personId, scale = 1, offsetY = 0) {
  if (!img || !a || !b) return null;

  let mid = midpoint(a, b);
  let len = dist(a.x, a.y, b.x, b.y);
  let angle = atan2(b.y - a.y, b.x - a.x);

  // Calculate width and height based on body part type
  let drawWidth, drawHeight, aspect;

  if (partName === "head") {
    // Head: circular/oval, size based on distance from nose to shoulders
    drawWidth = len * 1.2;  // width of head
    drawHeight = len * 1.4; // height of head (slightly taller)
    aspect = drawHeight / drawWidth;
  } else if (partName === "chest") {
    // Chest: width = shoulder width, height = torso length
    drawWidth = len * 0.7;  // torso width
    drawHeight = len * 1.0; // full torso length
    aspect = drawHeight / drawWidth;
  } else {
    // Limbs: thin width, full length along the bone
    drawWidth = len * 0.35;  // limb thickness (width)
    drawHeight = len * 1.0;  // full bone length
    aspect = drawHeight / drawWidth;
  }

  // Get color for this body part
  let partColor = BODY_PART_COLORS[partName] || [200, 200, 200];

  push();
  translate(mid.x, mid.y);
  rotate(angle - PI / 2);

  // Draw the shape (ellipse)
  fill(partColor[0], partColor[1], partColor[2], 180);
  stroke(255);
  strokeWeight(2);
  ellipseMode(CENTER);
  ellipse(0, 0, drawWidth, drawHeight);

  // Draw label
  fill(255);
  noStroke();
  textSize(12);
  textAlign(CENTER, CENTER);
  text(partName, 0, 0);

  pop();

  // Draw keypoint dots
  fill(255, 255, 0);
  noStroke();
  circle(a.x, a.y, 6);
  circle(b.x, b.y, 6);

  // Log dimensions (every 10 frames)
  if (useShapeMode && frameCount % 10 === 0) {
    logDimension(partName, personId, drawWidth, drawHeight, aspect);
  }

  return { width: drawWidth, height: drawHeight, aspect: aspect };
}

/* =========================
   DIMENSION TRACKING
========================= */

function logDimension(partName, personId, width, height, aspect) {
  // Add to history buffer
  dimensionHistory.push({
    frame: frameCount,
    partName: partName,
    personId: personId,
    width: width,
    height: height,
    aspect: aspect
  });

  // Keep only last MAX_HISTORY_FRAMES
  if (dimensionHistory.length > MAX_HISTORY_FRAMES) {
    dimensionHistory.shift();
  }

  // Update stats
  updateDimensionStats();

  // Console log
  console.log(`[Frame ${frameCount}] Person ${personId} - ${partName}: ${width.toFixed(1)}x${height.toFixed(1)}px (aspect: ${aspect.toFixed(2)})`);
}

function updateDimensionStats() {
  dimensionStats = {};

  // Group by part name
  let partGroups = {};
  for (let entry of dimensionHistory) {
    if (!partGroups[entry.partName]) {
      partGroups[entry.partName] = [];
    }
    partGroups[entry.partName].push(entry);
  }

  // Calculate stats for each part
  for (let partName in partGroups) {
    let entries = partGroups[partName];
    let widths = entries.map(e => e.width).sort((a, b) => a - b);
    let heights = entries.map(e => e.height).sort((a, b) => a - b);
    let aspects = entries.map(e => e.aspect);

    let minW = Math.min(...widths);
    let maxW = Math.max(...widths);
    let medianW = widths[Math.floor(widths.length / 2)];

    let minH = Math.min(...heights);
    let maxH = Math.max(...heights);
    let medianH = heights[Math.floor(heights.length / 2)];

    // Most common aspect ratio (mode)
    let aspectMode = aspects.reduce((acc, val) => {
      acc[val.toFixed(2)] = (acc[val.toFixed(2)] || 0) + 1;
      return acc;
    }, {});
    let mostCommonAspect = parseFloat(Object.keys(aspectMode).reduce((a, b) =>
      aspectMode[a] > aspectMode[b] ? a : b
    ));

    // Suggested cutout size (rounded to nearest 10)
    let suggestedW = Math.round(medianW / 10) * 10;
    let suggestedH = Math.round(medianH / 10) * 10;

    dimensionStats[partName] = {
      minW, maxW, medianW,
      minH, maxH, medianH,
      suggestedCutoutW: suggestedW,
      suggestedCutoutH: suggestedH,
      aspectRatio: mostCommonAspect
    };
  }
}

function drawDimensionPanel() {
  if (!useShapeMode || Object.keys(dimensionStats).length === 0) return;

  push();

  // Panel background
  fill(0, 0, 0, 200);
  stroke(255);
  strokeWeight(2);
  let panelX = width - 420;
  let panelY = 20;
  let panelW = 400;
  let lineHeight = 20;
  let padding = 10;

  let numParts = Object.keys(dimensionStats).length;
  let panelH = padding * 2 + lineHeight * (numParts * 3 + 2);

  rect(panelX, panelY, panelW, panelH);

  // Panel content
  fill(255);
  noStroke();
  textSize(14);
  textAlign(LEFT, TOP);

  let y = panelY + padding;
  text("DIMENSION ANALYSIS", panelX + padding, y);
  y += lineHeight;
  text(`Frames analyzed: ${dimensionHistory.length}`, panelX + padding, y);
  y += lineHeight + 5;

  textSize(11);
  for (let partName in dimensionStats) {
    let stats = dimensionStats[partName];

    fill(BODY_PART_COLORS[partName] || [200, 200, 200]);
    text(`${partName}:`, panelX + padding, y);
    y += lineHeight;

    fill(255);
    text(`  Range: ${stats.minW.toFixed(0)}-${stats.maxW.toFixed(0)} x ${stats.minH.toFixed(0)}-${stats.maxH.toFixed(0)}px`, panelX + padding, y);
    y += lineHeight;

    fill(100, 255, 100);
    text(`  Suggested: ${stats.suggestedCutoutW} x ${stats.suggestedCutoutH}px (${stats.aspectRatio.toFixed(2)})`, panelX + padding, y);
    y += lineHeight + 3;
  }

  pop();
}

function exportDimensionReport() {
  if (dimensionHistory.length === 0) {
    console.warn("No dimension data to export. Enable shape mode first.");
    alert("No dimension data to export. Enable shape mode and let it run for a few frames.");
    return;
  }

  updateDimensionStats();

  let report = [];
  for (let partName in dimensionStats) {
    let stats = dimensionStats[partName];
    report.push({
      bodyPart: partName,
      minW: stats.minW,
      maxW: stats.maxW,
      medianW: stats.medianW,
      minH: stats.minH,
      maxH: stats.maxH,
      medianH: stats.medianH,
      suggestedCutoutW: stats.suggestedCutoutW,
      suggestedCutoutH: stats.suggestedCutoutH,
      aspectRatio: stats.aspectRatio
    });
  }

  // Output to console
  console.log("=== DIMENSION REPORT ===");
  console.log(JSON.stringify(report, null, 2));

  // Trigger download
  let dataStr = JSON.stringify(report, null, 2);
  let dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

  let exportFileDefaultName = 'dimensions_report.json';

  let linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();

  console.log("Report exported and download triggered.");
}