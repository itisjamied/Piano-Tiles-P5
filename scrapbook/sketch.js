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

// backdrop toggle
let backdropIframe;
let backdropToggle;
let showBackdrop = false;

// image overlay toggle
let imageOverlayToggle;
let showImageOverlay = true;

// dimension tracking
let dimensionHistory = [];
const MAX_HISTORY_FRAMES = 300;
let dimensionStats = {};

// multi-person tracking
let trackedPeople = {};
let nextPersonId = 0;

let characterImageSets = [];

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

// Color mapping for shape mode — vibrant cool palette
const BODY_PART_COLORS = {
  "head": [0, 230, 255],           // vivid cyan
  "chest": [40, 80, 255],          // vivid blue
  "left-shoulder": [100, 50, 255], // blue-violet
  "right-shoulder": [100, 50, 255],// blue-violet
  "left-arm": [0, 200, 230],       // teal-cyan
  "right-arm": [0, 200, 230],      // teal-cyan
  "left-thigh": [160, 40, 255],    // vivid violet
  "right-thigh": [160, 40, 255],   // vivid violet
  "left-leg": [0, 170, 210],       // deep teal
  "right-leg": [0, 170, 210]       // deep teal
};

// tuning
const SMOOTHING = 0.06;
const MATCH_DISTANCE = 180;   // max px to match same person
const MAX_MISSING_FRAMES = 20;
const MAX_TRACKED_PEOPLE = 10;
const MIN_CONFIDENCE = 0.2;

// color trail
const TRAIL_LENGTH = 60;       // number of ghost frames kept
const TRAIL_SAMPLE_RATE = 1;   // capture a snapshot every N draw frames

function preload() {

   function loadCharacterImages(folder) {
    let imgs = {};
    const parts = [
      "head", "chest",
      "left-shoulder", "left-arm", "left-thigh", "left-leg",
      "right-shoulder", "right-arm", "right-thigh", "right-leg"
    ];
    for (let part of parts) {
      imgs[part] = loadImage(`${folder}/${part}.png`);
    }
    // Alias right-side limbs to their left counterparts if needed
    // if (!imgs["right-shoulder"]) imgs["right-shoulder"] = imgs["left-shoulder"];
    // if (!imgs["right-arm"]) imgs["right-arm"] = imgs["left-arm"];
    // if (!imgs["right-thigh"]) imgs["right-thigh"] = imgs["left-thigh"];
    // if (!imgs["right-leg"]) imgs["right-leg"] = imgs["left-leg"];
    return imgs;
  }

    characterImageSets = [
    loadCharacterImages("jordan"),
    loadCharacterImages("ice-cube"),
    // Add more folders here as needed
  ];

  bodyPose = ml5.bodyPose("MoveNet", { flipped: true });

  // Right limb images are mirrored from left at render time.
  // Only 6 image files are required: head, chest,
  // left-shoulder, left-arm, left-thigh, left-leg.

  // Load unique images
  // bodyPartImages["head"] = loadImage(`lebron/head.png`);
  // bodyPartImages["chest"] = loadImage(`lebron/chest.png`);
  // bodyPartImages["left-shoulder"] = loadImage(`lebron/left-shoulder.png`);
  // bodyPartImages["left-arm"] = loadImage(`lebron/left-arm.png`);
  // bodyPartImages["left-thigh"] = loadImage(`lebron/left-thigh.png`);
  // bodyPartImages["left-leg"] = loadImage(`lebron/left-leg.png`);

  // Alias right-side limbs to their left counterparts (will be flipped at render)
  // bodyPartImages["right-shoulder"] = bodyPartImages["left-shoulder"];
  // bodyPartImages["right-arm"] = bodyPartImages["left-arm"];
  // bodyPartImages["right-thigh"] = bodyPartImages["left-thigh"];
  // bodyPartImages["right-leg"] = bodyPartImages["left-leg"];
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

  // Backdrop iframe (YouTube, looping, muted for autoplay)
  backdropIframe = createElement('iframe');
  backdropIframe.id('backdropFrame');
  backdropIframe.attribute('src', 'https://www.youtube.com/embed/xaeIuEY-jNo?autoplay=1&loop=1&mute=1&playlist=xaeIuEY-jNo&controls=0');
  backdropIframe.attribute('allow', 'autoplay; encrypted-media; accelerometer; gyroscope; picture-in-picture');
  backdropIframe.attribute('frameborder', '0');

  // Backdrop toggle
  backdropToggle = createCheckbox(" Show backdrop", false);
  backdropToggle.parent("checkboxContainer");
  backdropToggle.style("color", "white");
  backdropToggle.style("font-size", "18px");
  backdropToggle.style("display", "block");
  backdropToggle.style("margin-bottom", "10px");
  backdropToggle.changed(() => {
    showBackdrop = backdropToggle.checked();
    let frame = document.getElementById('backdropFrame');
    if (frame) frame.style.display = showBackdrop ? 'block' : 'none';
  });

  // Image overlay toggle
  imageOverlayToggle = createCheckbox(" Show image overlay", true);
  imageOverlayToggle.parent("checkboxContainer");
  imageOverlayToggle.style("color", "white");
  imageOverlayToggle.style("font-size", "18px");
  imageOverlayToggle.style("display", "block");
  imageOverlayToggle.style("margin-bottom", "10px");
  imageOverlayToggle.changed(() => {
    showImageOverlay = imageOverlayToggle.checked();
  });

  // Export button
  exportButton = createButton("Export Dimension Report");
  exportButton.parent("checkboxContainer");
  exportButton.style("font-size", "16px");
  exportButton.mousePressed(exportDimensionReport);
}

function draw() {
  // When backdrop iframe is active, make canvas transparent so the video shows through
  if (showBackdrop) {
    clear();
  } else {
    background(0);
  }

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

  let characterIndex = (Object.keys(trackedPeople).length) % characterImageSets.length;

  trackedPeople[id] = {
    id,
    smoothPoints,
    center: createVector(center.x, center.y),
    lastSeen: frameCount,
    accent: random(360),
    characterIndex,
    poseHistory: []
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

  // Capture trail snapshot at regular intervals
  if (frameCount % TRAIL_SAMPLE_RATE === 0) {
    let snapshot = {};
    for (let name in person.smoothPoints) {
      snapshot[name] = person.smoothPoints[name].copy();
    }
    person.poseHistory.push(snapshot);
    if (person.poseHistory.length > TRAIL_LENGTH) {
      person.poseHistory.shift();
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

  let images = characterImageSets[person.characterIndex] || characterImageSets[0];

  // --- Single dot layer with per-dot fluid trails ---
  if (!useShapeMode) {
    let shimmer = (frameCount * 1.2) % 360;
    let base    = (person.accent + shimmer) % 360;
    drawBodyAtSnapshot(person, person.smoothPoints, 85, base, person.poseHistory);
  }

  // Render body parts (either images or shapes based on mode)
  if (useShapeMode) {
    // In shape mode, use normalized scale factors to show true skeletal proportions
    drawBodyShape(images["left-arm"], leftElbow, leftWrist, "left-arm", id, 0.8);
    drawBodyShape(images["left-shoulder"], leftShoulder, leftElbow, "left-shoulder", id, 0.8);

    drawBodyShape(images["right-arm"], rightElbow, rightWrist, "right-arm", id, 0.8);
    drawBodyShape(images["right-shoulder"], rightShoulder, rightElbow, "right-shoulder", id, 0.8);

    drawBodyShape(images["left-leg"], leftKnee, leftAnkle, "left-leg", id, 0.8);
    drawBodyShape(images["left-thigh"], leftHip, leftKnee, "left-thigh", id, 0.8);

    drawBodyShape(images["right-leg"], rightKnee, rightAnkle, "right-leg", id, 0.8);
    drawBodyShape(images["right-thigh"], rightHip, rightKnee, "right-thigh", id, 0.8);

    drawBodyShape(images["chest"], shoulderCenter, hipCenter, "chest", id, 0.8);

    drawBodyShape(images["head"], nose, shoulderCenter, "head", id, 1.2, 0.25);
  } else if (showImageOverlay) {
    // In image mode, use artistic scale factors for collage effect
    noTint();
    colorMode(RGB);

    drawBodyImage(images["left-leg"],       leftKnee,      leftAnkle,      .4   * 1.05, 0, false);
    drawBodyImage(images["left-thigh"],     leftHip,       leftKnee,       .4   * 1.05, 0, false);
    drawBodyImage(images["right-leg"],      rightKnee,     rightAnkle,     .4   * 1.05, 0, false);
    drawBodyImage(images["right-thigh"],    rightHip,      rightKnee,      .4   * 1.05, 0, false);
    drawBodyImage(images["chest"],          shoulderCenter, hipCenter,     .8   * 0.95, 0, false);
    drawBodyImage(images["left-shoulder"],  leftShoulder,  leftElbow,      .5 * 0.85 * 1.05, 0, false);
    drawBodyImage(images["right-shoulder"], rightShoulder, rightElbow,     .5 * 0.85 * 1.05, 0, false);

    // Arms: shifted 15px inward
    let lElbowIn = createVector(leftElbow.x  + 15, leftElbow.y);
    let lWristIn = createVector(leftWrist.x  + 15, leftWrist.y);
    let rElbowIn = createVector(rightElbow.x - 15, rightElbow.y);
    let rWristIn = createVector(rightWrist.x - 15, rightWrist.y);
    drawBodyImage(images["left-arm"],  lElbowIn, lWristIn, .55 * 0.85 * 0.9 * 1.05, 0, false);
    drawBodyImage(images["right-arm"], rElbowIn, rWristIn, .55 * 0.85 * 0.9 * 1.05, 0, false);

    // Head: offset proportional to head size so it scales with the body
    let headLen = dist(nose.x, nose.y, shoulderCenter.x, shoulderCenter.y);
    let adjustedNose = createVector(nose.x, nose.y - headLen * 0.8);
    drawBodyImage(images["head"], adjustedNose, shoulderCenter, 0.675, 0, false);

    noTint();
    colorMode(RGB);
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

  translate(0, -drawHeight * offsetY);

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
    // translate( 0, -600, 0);
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
   COLOR TRAIL
========================= */

// Returns a keypoint map linearly interpolated between two snapshots
function lerpSnapshots(ptsA, ptsB, t) {
  let result = {};
  for (let key in ptsA) {
    if (ptsB[key]) {
      result[key] = createVector(
        lerp(ptsA[key].x, ptsB[key].x, t),
        lerp(ptsA[key].y, ptsB[key].y, t)
      );
    } else {
      result[key] = ptsA[key].copy();
    }
  }
  return result;
}


function drawBodyAtSnapshot(person, pts, alpha, tintHue, ptsHistory = []) {
  let nose          = pts["nose"];
  let leftShoulder  = pts["left_shoulder"];
  let rightShoulder = pts["right_shoulder"];
  let leftElbow     = pts["left_elbow"];
  let rightElbow    = pts["right_elbow"];
  let leftWrist     = pts["left_wrist"];
  let rightWrist    = pts["right_wrist"];
  let leftHip       = pts["left_hip"];
  let rightHip      = pts["right_hip"];
  let leftKnee      = pts["left_knee"];
  let rightKnee     = pts["right_knee"];
  let leftAnkle     = pts["left_ankle"];
  let rightAnkle    = pts["right_ankle"];

  if (!nose || !leftShoulder || !rightShoulder ||
      !leftHip || !rightHip || !leftElbow || !rightElbow ||
      !leftWrist || !rightWrist || !leftKnee || !rightKnee ||
      !leftAnkle || !rightAnkle) return;

  let shoulderCenter = midpoint(leftShoulder, rightShoulder);

  colorMode(HSL);
  ellipseMode(CENTER);

  // Shimmer cycles through the cool hue range
  let shimmer = (frameCount * 0.6) % 360;
  let base    = (tintHue + shimmer) % 360;
  const DOT = 3;
  const GAP = 20;

  // Subsample history to ~8 evenly-spaced frames for fluid trails
  function hist(name) {
    if (ptsHistory.length === 0) return [];
    let step = max(1, floor(ptsHistory.length / 14));
    let out  = [];
    for (let i = 0; i < ptsHistory.length; i += step) {
      let p = ptsHistory[i][name];
      if (p) out.push(p);
    }
    return out;
  }

  // Arms
  dotFillSegment(leftShoulder,  leftElbow,  0.40, 0.30, DOT, GAP, (base)      % 360, alpha, hist("left_shoulder"),  hist("left_elbow"));
  dotFillSegment(leftElbow,     leftWrist,  0.30, 0.18, DOT, GAP, (base + 15) % 360, alpha, hist("left_elbow"),     hist("left_wrist"));
  dotFillSegment(rightShoulder, rightElbow, 0.40, 0.30, DOT, GAP, (base + 30) % 360, alpha, hist("right_shoulder"), hist("right_elbow"));
  dotFillSegment(rightElbow,    rightWrist, 0.30, 0.18, DOT, GAP, (base + 45) % 360, alpha, hist("right_elbow"),    hist("right_wrist"));

  // Legs
  dotFillSegment(leftHip,   leftKnee,   0.48, 0.36, DOT, GAP, (base + 60)  % 360, alpha, hist("left_hip"),   hist("left_knee"));
  dotFillSegment(leftKnee,  leftAnkle,  0.36, 0.22, DOT, GAP, (base + 75)  % 360, alpha, hist("left_knee"),  hist("left_ankle"));
  dotFillSegment(rightHip,  rightKnee,  0.48, 0.36, DOT, GAP, (base + 90)  % 360, alpha, hist("right_hip"),  hist("right_knee"));
  dotFillSegment(rightKnee, rightAnkle, 0.36, 0.22, DOT, GAP, (base + 105) % 360, alpha, hist("right_knee"), hist("right_ankle"));

  // Torso
  dotFillTorso(leftShoulder, rightShoulder, leftHip, rightHip, DOT, GAP, (base + 120) % 360, alpha,
    hist("left_shoulder"), hist("right_shoulder"), hist("left_hip"), hist("right_hip"));

  // Head
  let headLen   = dist(nose.x, nose.y, shoulderCenter.x, shoulderCenter.y);
  let noseHist  = hist("nose");
  let lsHist    = hist("left_shoulder");
  let rsHist    = hist("right_shoulder");
  let cxHistory = noseHist.map(p => p.x);
  let cyHistory = noseHist.map((p, i) => {
    let ls = lsHist[i], rs = rsHist[i];
    let sc = (ls && rs) ? midpoint(ls, rs) : shoulderCenter;
    let hl = dist(p.x, p.y, sc.x, sc.y);
    return p.y - hl * 0.15;
  });
  dotFillEllipse(nose.x, nose.y - headLen * 0.15, headLen * 0.41, headLen * 0.46,
    DOT, GAP, (base + 150) % 360, alpha, cxHistory, cyHistory);

  noStroke();
  colorMode(RGB);
}

// Fills a tapered capsule with dots; each dot has a fluid multi-point trail through history
function dotFillSegment(a, b, ratioA, ratioB, dotSize, spacing, hue, alpha, aHist = [], bHist = []) {
  let len = dist(a.x, a.y, b.x, b.y);
  if (len < 1) return;
  let angle = atan2(b.y - a.y, b.x - a.x);
  let lx = cos(angle), ly = sin(angle);
  let nx = -ly,        ny = lx;

  // Precompute geometry for each history frame
  let histGeo = [];
  let hLen = min(aHist.length, bHist.length);
  for (let i = 0; i < hLen; i++) {
    let aH = aHist[i], bH = bHist[i];
    if (!aH || !bH) continue;
    let lH   = dist(aH.x, aH.y, bH.x, bH.y);
    let angH = atan2(bH.y - aH.y, bH.x - aH.x);
    histGeo.push({ aH, bH, lH, nxH: -sin(angH), nyH: cos(angH) });
  }

  let jitter  = spacing * 0.25;
  let steps   = max(1, floor(len / spacing));
  // Extend loop into cap regions so hemispherical ends are actually filled
  let capExtA = ceil((len * ratioA / 2) / spacing);
  let capExtB = ceil((len * ratioB / 2) / spacing);
  let dots    = [];

  for (let s = -capExtA; s <= steps + capExtB; s++) {
    let t     = s / steps;
    let cx    = lerp(a.x, b.x, t);
    let cy    = lerp(a.y, b.y, t);
    // Use the appropriate cap radius when outside the bone endpoints
    let halfW = t < 0 ? (len * ratioA / 2) : t > 1 ? (len * ratioB / 2) : lerp(len * ratioA, len * ratioB, t) / 2;
    let wN    = max(1, floor((halfW * 2) / spacing));

    for (let w = -wN; w <= wN; w++) {
      let jx  = (noise(s * 0.4, w * 0.8)      - 0.5) * jitter * 2;
      let jy  = (noise(s * 0.8 + 99, w * 0.4) - 0.5) * jitter * 2;
      let off = wN > 0 ? (w / wN) * halfW : 0;
      let dx  = cx + nx * off + jx;
      let dy  = cy + ny * off + jy;
      if (!inTaperedCapsule(dx, dy, a, b, len, ratioA, ratioB, lx, ly, nx, ny)) continue;

      // Build trail: one position per history frame using same (s,w) parametric coords
      let trail = [];
      for (let g of histGeo) {
        let cxH   = lerp(g.aH.x, g.bH.x, t);
        let cyH   = lerp(g.aH.y, g.bH.y, t);
        let hwH   = lerp(g.lH * ratioA, g.lH * ratioB, t) / 2;
        let offH  = wN > 0 ? (w / wN) * hwH : 0;
        trail.push({ x: cxH + g.nxH * offH + jx, y: cyH + g.nyH * offH + jy });
      }
      trail.push({ x: dx, y: dy }); // current position at tip

      let sz = dotSize * (0.65 + noise(s * 0.6 + 33, w * 0.6 + 33) * 0.7);
      // Two-octave noise for per-dot metallic gradient
      let nc = noise(dx * 0.012, dy * 0.012, frameCount * 0.006) * 0.7 +
               noise(dx * 0.04 + 50, dy * 0.04 + 50, frameCount * 0.01 + 99) * 0.3;
      // Fade dots near the boundary so edges appear smooth and rounded
      let edgeDist = capsuleEdgeDist(dx, dy, a, b, len, ratioA, ratioB, lx, ly, nx, ny);
      let edgeFade = constrain(edgeDist / (spacing * 2.5), 0, 1);
      dots.push({ dx, dy, trail, sz, nc, edgeFade });
    }
  }

  // Map hue to vibrant cool palette (cyan → blue → violet, 170–290°)
  let mh      = ((hue % 360) + 360) % 360;
  let coolHue = 170 + (mh / 360) * 120;

  // Pass 1: fluid trails — lightness sweeps dark→bright per dot
  if (histGeo.length > 0) {
    for (let d of dots) {
      let dotLit = map(d.nc, 0, 1, 18, 82);
      for (let i = 0; i < d.trail.length - 1; i++) {
        let progress = i / (d.trail.length - 1);
        let sLit = lerp(12, dotLit + 10, progress);
        let sSat = lerp(72, 100, d.nc);
        stroke(coolHue, sSat, sLit, lerp(0, alpha * 0.55, pow(progress, 1.2)) * d.edgeFade);
        strokeWeight(lerp(0.4, dotSize * 1.3, progress));
        line(d.trail[i].x, d.trail[i].y, d.trail[i + 1].x, d.trail[i + 1].y);
      }
    }
  }

  // Pass 2: dots — vibrant cool colors with per-dot lightness and edge fade
  noStroke();
  for (let d of dots) {
    let dotLit  = map(d.nc, 0, 1, 18, 82);
    let dotSat  = lerp(72, 100, d.nc);
    let hShift  = map(d.nc, 0, 1, -8, 8);
    let fadedSz = d.sz * (0.15 + 0.85 * d.edgeFade);
    fill(constrain(coolHue + hShift, 160, 300), dotSat, dotLit, alpha * pow(d.edgeFade, 0.5));
    ellipse(d.dx, d.dy, fadedSz, fadedSz);
  }
}

// Returns pixel distance from (x,y) to the boundary of the tapered capsule (positive = inside)
function capsuleEdgeDist(x, y, a, b, len, ratioA, ratioB, lx, ly, nx, ny) {
  let ax = x - a.x, ay = y - a.y;
  let along = ax * lx + ay * ly;
  if (along <= 0) {
    return (len * ratioA / 2) - sqrt(ax * ax + ay * ay);
  }
  if (along >= len) {
    let bx = x - b.x, by = y - b.y;
    return (len * ratioB / 2) - sqrt(bx * bx + by * by);
  }
  let perp = abs(ax * nx + ay * ny);
  return lerp(len * ratioA, len * ratioB, along / len) / 2 - perp;
}

// Returns true if point (x,y) is inside the tapered capsule between a and b
function inTaperedCapsule(x, y, a, b, len, ratioA, ratioB, lx, ly, nx, ny) {
  let ax    = x - a.x, ay = y - a.y;
  let along = ax * lx + ay * ly;
  let perp  = abs(ax * nx + ay * ny);

  if (along < 0) {
    return (ax * ax + ay * ay) <= pow(len * ratioA / 2, 2);
  }
  if (along > len) {
    let bx = x - b.x, by = y - b.y;
    return (bx * bx + by * by) <= pow(len * ratioB / 2, 2);
  }
  return perp <= lerp(len * ratioA, len * ratioB, along / len) / 2;
}

function dotFillTorso(ls, rs, lh, rh, dotSize, spacing, hue, alpha, lsH = [], rsH = [], lhH = [], rhH = []) {
  let sMid = midpoint(ls, rs);
  let hMid = midpoint(lh, rh);
  let sHW  = dist(ls.x, ls.y, rs.x, rs.y) * 0.368; // 0.46 * 0.8 — 20% narrower
  let hHW  = dist(lh.x, lh.y, rh.x, rh.y) * 0.368;
  let len  = dist(sMid.x, sMid.y, hMid.x, hMid.y);
  if (len < 1) return;

  let angle = atan2(hMid.y - sMid.y, hMid.x - sMid.x);
  let lx = cos(angle), ly = sin(angle);
  let nx = -ly,        ny = lx;

  // Precompute torso geometry per history frame
  let histGeo = [];
  let hLen = min(lsH.length, rsH.length, lhH.length, rhH.length);
  for (let i = 0; i < hLen; i++) {
    if (!lsH[i] || !rsH[i] || !lhH[i] || !rhH[i]) continue;
    let smH  = midpoint(lsH[i], rsH[i]);
    let hmH  = midpoint(lhH[i], rhH[i]);
    let sHWH = dist(lsH[i].x, lsH[i].y, rsH[i].x, rsH[i].y) * 0.368;
    let hHWH = dist(lhH[i].x, lhH[i].y, rhH[i].x, rhH[i].y) * 0.368;
    let angH = atan2(hmH.y - smH.y, hmH.x - smH.x);
    histGeo.push({ smH, hmH, sHWH, hHWH, nxH: -sin(angH), nyH: cos(angH) });
  }

  let jitter  = spacing * 0.25;
  let steps   = max(1, floor(len / spacing));
  // Extend into rounded cap regions at shoulder and hip
  let capExtS = ceil(sHW / spacing);
  let capExtH = ceil(hHW / spacing);
  let dots    = [];

  for (let s = -capExtS; s <= steps + capExtH; s++) {
    let t     = s / steps;
    let cx    = lerp(sMid.x, hMid.x, t);
    let cy    = lerp(sMid.y, hMid.y, t);
    let halfW = t < 0 ? sHW : t > 1 ? hHW : lerp(sHW, hHW, t);
    let wN    = max(1, floor((halfW * 2) / spacing));

    for (let w = -wN; w <= wN; w++) {
      let jx  = (noise(s * 0.4 + 200, w * 0.8 + 200) - 0.5) * jitter * 2;
      let jy  = (noise(s * 0.8 + 300, w * 0.4 + 300) - 0.5) * jitter * 2;
      let off = wN > 0 ? (w / wN) * halfW : 0;
      let dx  = cx + nx * off + jx;
      let dy  = cy + ny * off + jy;

      let ax = dx - sMid.x, ay2 = dy - sMid.y;
      let along2 = ax * lx + ay2 * ly;
      let perp2  = abs(ax * nx + ay2 * ny);
      let inTorso;
      if (along2 < 0) {
        // Rounded cap at shoulder line
        inTorso = (ax * ax + ay2 * ay2) <= sHW * sHW;
      } else if (along2 > len) {
        // Rounded cap at hip line
        let bx2 = dx - hMid.x, by2 = dy - hMid.y;
        inTorso = (bx2 * bx2 + by2 * by2) <= hHW * hHW;
      } else {
        inTorso = perp2 <= lerp(sHW, hHW, along2 / len);
      }
      if (!inTorso) continue;

      let trail = [];
      for (let g of histGeo) {
        let cxH  = lerp(g.smH.x, g.hmH.x, t);
        let cyH  = lerp(g.smH.y, g.hmH.y, t);
        let hwH  = lerp(g.sHWH, g.hHWH, t);
        let offH = wN > 0 ? (w / wN) * hwH : 0;
        trail.push({ x: cxH + g.nxH * offH + jx, y: cyH + g.nyH * offH + jy });
      }
      trail.push({ x: dx, y: dy });

      let sz = dotSize * (0.65 + noise(s * 0.6 + 400, w * 0.6 + 400) * 0.7);
      let nc = noise(dx * 0.012, dy * 0.012, frameCount * 0.006) * 0.7 +
               noise(dx * 0.04 + 150, dy * 0.04 + 150, frameCount * 0.01 + 99) * 0.3;
      // Edge fade for smooth rounded boundary
      let axEF = dx - sMid.x, ayEF = dy - sMid.y;
      let alongEF = axEF * lx + ayEF * ly;
      let edgeDistT;
      if (alongEF <= 0) {
        edgeDistT = sHW - sqrt(axEF * axEF + ayEF * ayEF);
      } else if (alongEF >= len) {
        let bxEF = dx - hMid.x, byEF = dy - hMid.y;
        edgeDistT = hHW - sqrt(bxEF * bxEF + byEF * byEF);
      } else {
        edgeDistT = lerp(sHW, hHW, alongEF / len) - abs(axEF * nx + ayEF * ny);
      }
      let edgeFade = constrain(edgeDistT / (spacing * 2.5), 0, 1);
      dots.push({ dx, dy, trail, sz, nc, edgeFade });
    }
  }

  // Map hue to vibrant cool palette for torso
  let mhT     = ((hue % 360) + 360) % 360;
  let coolHueT = 170 + (mhT / 360) * 120;

  if (histGeo.length > 0) {
    for (let d of dots) {
      let dotLitT = map(d.nc, 0, 1, 18, 82);
      for (let i = 0; i < d.trail.length - 1; i++) {
        let progress = i / (d.trail.length - 1);
        let sLitT = lerp(12, dotLitT + 10, progress);
        let sSatT = lerp(72, 100, d.nc);
        stroke(coolHueT, sSatT, sLitT, lerp(0, alpha * 0.55, pow(progress, 1.2)) * d.edgeFade);
        strokeWeight(lerp(0.4, dotSize * 1.3, progress));
        line(d.trail[i].x, d.trail[i].y, d.trail[i + 1].x, d.trail[i + 1].y);
      }
    }
  }
  noStroke();
  for (let d of dots) {
    let dotLitT  = map(d.nc, 0, 1, 18, 82);
    let dotSatT  = lerp(72, 100, d.nc);
    let hShiftT  = map(d.nc, 0, 1, -8, 8);
    let fadedSzT = d.sz * (0.15 + 0.85 * d.edgeFade);
    fill(constrain(coolHueT + hShiftT, 160, 300), dotSatT, dotLitT, alpha * pow(d.edgeFade, 0.5));
    ellipse(d.dx, d.dy, fadedSzT, fadedSzT);
  }
}

function dotFillEllipse(cx, cy, rx, ry, dotSize, spacing, hue, alpha, cxHist = [], cyHist = []) {
  let hasHist = cxHist.length > 0 && cyHist.length > 0;
  let jitter  = spacing * 0.25;
  let dots    = [];

  for (let x = -rx; x <= rx; x += spacing) {
    for (let y = -ry; y <= ry; y += spacing) {
      let jx = (noise(x * 0.05 + 500, y * 0.05 + 500) - 0.5) * jitter * 2;
      let jy = (noise(x * 0.05 + 600, y * 0.05 + 600) - 0.5) * jitter * 2;
      let sx = x + jx, sy = y + jy;
      if ((sx * sx) / (rx * rx) + (sy * sy) / (ry * ry) > 1) continue;

      // Trail: apply same local offset to each historical center
      let trail = [];
      let hLen  = min(cxHist.length, cyHist.length);
      for (let i = 0; i < hLen; i++) {
        trail.push({ x: cxHist[i] + sx, y: cyHist[i] + sy });
      }
      trail.push({ x: cx + sx, y: cy + sy });

      let sz = dotSize * (0.65 + noise(x * 0.08 + 700, y * 0.08 + 700) * 0.7);
      let dxE = cx + sx, dyE = cy + sy;
      let nc = noise(dxE * 0.012, dyE * 0.012, frameCount * 0.006) * 0.7 +
               noise(dxE * 0.04 + 250, dyE * 0.04 + 250, frameCount * 0.01 + 99) * 0.3;
      // Ellipse edge fade: normalised radius 0=centre, 1=boundary
      let normR = sqrt((sx * sx) / (rx * rx) + (sy * sy) / (ry * ry));
      let edgeFade = constrain((1 - normR) * min(rx, ry) / (spacing * 2.5), 0, 1);
      dots.push({ dx: dxE, dy: dyE, trail, sz, nc, edgeFade });
    }
  }

  // Map hue to vibrant cool palette for head ellipse
  let mhE      = ((hue % 360) + 360) % 360;
  let coolHueE = 170 + (mhE / 360) * 120;

  if (hasHist) {
    for (let d of dots) {
      let dotLitE = map(d.nc, 0, 1, 18, 82);
      for (let i = 0; i < d.trail.length - 1; i++) {
        let progress = i / (d.trail.length - 1);
        let sLitE = lerp(12, dotLitE + 10, progress);
        let sSatE = lerp(72, 100, d.nc);
        stroke(coolHueE, sSatE, sLitE, lerp(0, alpha * 0.55, pow(progress, 1.2)) * d.edgeFade);
        strokeWeight(lerp(0.4, dotSize * 1.3, progress));
        line(d.trail[i].x, d.trail[i].y, d.trail[i + 1].x, d.trail[i + 1].y);
      }
    }
  }
  noStroke();
  for (let d of dots) {
    let dotLitE  = map(d.nc, 0, 1, 18, 82);
    let dotSatE  = lerp(72, 100, d.nc);
    let hShiftE  = map(d.nc, 0, 1, -8, 8);
    let fadedSzE = d.sz * (0.15 + 0.85 * d.edgeFade);
    fill(constrain(coolHueE + hShiftE, 160, 300), dotSatE, dotLitE, alpha * pow(d.edgeFade, 0.5));
    ellipse(d.dx, d.dy, fadedSzE, fadedSzE);
  }
}

// Tapered capsule: wide at joint a, narrow at joint b
function drawTaperedLimb(a, b, ratioA, ratioB) {
  let len   = dist(a.x, a.y, b.x, b.y);
  let angle = atan2(b.y - a.y, b.x - a.x);
  let px    = cos(angle + HALF_PI);
  let py    = sin(angle + HALF_PI);

  let hwA = (len * ratioA) / 2;
  let hwB = (len * ratioB) / 2;

  noStroke();
  beginShape();
  vertex(a.x + px * hwA, a.y + py * hwA);
  vertex(b.x + px * hwB, b.y + py * hwB);
  vertex(b.x - px * hwB, b.y - py * hwB);
  vertex(a.x - px * hwA, a.y - py * hwA);
  endShape(CLOSE);

  // Rounded caps
  ellipseMode(CENTER);
  ellipse(a.x, a.y, len * ratioA, len * ratioA);
  ellipse(b.x, b.y, len * ratioB, len * ratioB);
}

// Torso as a trapezoid following actual shoulder/hip keypoints
function drawTorsoSilhouette(ls, rs, lh, rh) {
  let sHW = dist(ls.x, ls.y, rs.x, rs.y) * 0.368;
  let hHW = dist(lh.x, lh.y, rh.x, rh.y) * 0.368;

  let sMid  = midpoint(ls, rs);
  let hMid  = midpoint(lh, rh);
  let angle = atan2(hMid.y - sMid.y, hMid.x - sMid.x);
  let px    = cos(angle + HALF_PI);
  let py    = sin(angle + HALF_PI);

  noStroke();
  beginShape();
  vertex(sMid.x + px * sHW, sMid.y + py * sHW);
  vertex(hMid.x + px * hHW, hMid.y + py * hHW);
  vertex(hMid.x - px * hHW, hMid.y - py * hHW);
  vertex(sMid.x - px * sHW, sMid.y - py * sHW);
  endShape(CLOSE);
  // Rounded caps at shoulder and hip lines
  ellipseMode(CENTER);
  ellipse(sMid.x, sMid.y, sHW * 2, sHW * 2);
  ellipse(hMid.x, hMid.y, hHW * 2, hHW * 2);
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