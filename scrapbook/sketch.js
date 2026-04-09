let video;
let bodyPose;
let poses = [];
let bodyPartImages = {};


let videoToggle;
let showVideo = true;

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

// tuning
const SMOOTHING = 0.25;
const MATCH_DISTANCE = 180;   // max px to match same person
const MAX_MISSING_FRAMES = 20;
const MAX_TRACKED_PEOPLE = 5;
const MIN_CONFIDENCE = 0.2;

function preload() {
  bodyPose = ml5.bodyPose("MoveNet", { flipped: true });

  const parts = [
    "head", "chest",
    "left-shoulder", "right-shoulder",
    "left-arm", "right-arm",
    "left-thigh", "right-thigh",
    "left-leg", "right-leg"
  ];
  for (let part of parts) {
    bodyPartImages[part] = loadImage(`lebron/${part}.png`);
  }
  bodyPose = ml5.bodyPose("MoveNet", { flipped: true });

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

  videoToggle = createCheckbox(" Show video", true);
  videoToggle.position(20, 20);
  videoToggle.style("color", "white");
  videoToggle.style("font-size", "18px");
  videoToggle.changed(() => {
    showVideo = videoToggle.checked();
  });
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



  drawBodyImage(bodyPartImages["left-arm"], leftElbow, leftWrist, .8);
  drawBodyImage(bodyPartImages["left-shoulder"], leftShoulder, leftElbow, .5);

  drawBodyImage(bodyPartImages["right-arm"], rightElbow, rightWrist, .8);
  drawBodyImage(bodyPartImages["right-shoulder"], rightShoulder, rightElbow, .5);

  drawBodyImage(bodyPartImages["left-leg"], leftKnee, leftAnkle, .4);
  drawBodyImage(bodyPartImages["left-thigh"], leftHip, leftKnee, .4);

  drawBodyImage(bodyPartImages["right-leg"], rightKnee, rightAnkle, .8);
  drawBodyImage(bodyPartImages["right-thigh"], rightHip, rightKnee, .4);

  drawBodyImage( bodyPartImages["chest"], shoulderCenter, hipCenter, .8 );

  drawBodyImage(bodyPartImages["head"], nose, shoulderCenter, 1.2, 0.25);



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

function drawBodyImage(img, a, b, scale = 1) {
  if (!img || !a || !b) return;

  let mid = midpoint(a, b);
  let len = dist(a.x, a.y, b.x, b.y);
  let angle = atan2(b.y - a.y, b.x - a.x);

  // preserve original image proportions
  let aspect = img.height / img.width;

  let drawWidth = len * scale;
  let drawHeight = drawWidth * aspect;

  push();
  translate(mid.x, mid.y);
  rotate(angle - PI / 2);

  // translate(0, -drawHeight * offsetY);

  imageMode(CENTER);

  image(img, 0, 0, drawWidth, drawHeight);

  pop();
}