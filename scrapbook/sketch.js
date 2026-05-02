let video;
let bodyPose;
let poses = [];

let videoToggle;
let showVideo = false;

// backdrop toggle
let backdropIframe;
let backdropToggle;
let showBackdrop = true;

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
  bodyPose = ml5.bodyPose("MoveNet", { flipped: true });
}

function mousePressed() {
  console.log("poses", poses);
  console.log("trackedPeople", trackedPeople);
}

function keyPressed() {
  if (key === 'h' || key === 'H') {
    let controls = document.querySelector('.controls');
    if (controls) {
      controls.style.display = controls.style.display === 'none' ? 'block' : 'none';
    }
  }
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
  videoToggle = createCheckbox(" Show video", false);
  videoToggle.parent("checkboxContainer");
  videoToggle.style("color", "white");
  videoToggle.style("font-size", "18px");
  videoToggle.style("display", "block");
  videoToggle.style("margin-bottom", "10px");
  videoToggle.changed(() => {
    showVideo = videoToggle.checked();
  });

  // Backdrop iframe (YouTube, looping, muted for autoplay)
  backdropIframe = createElement('iframe');
  backdropIframe.id('backdropFrame');
  backdropIframe.attribute('src', 'https://www.youtube.com/embed/xaeIuEY-jNo?autoplay=1&loop=1&mute=1&playlist=xaeIuEY-jNo&controls=0');
  backdropIframe.attribute('allow', 'autoplay; encrypted-media; accelerometer; gyroscope; picture-in-picture');
  backdropIframe.attribute('frameborder', '0');

  // Backdrop toggle (on by default)
  backdropToggle = createCheckbox(" Show backdrop", true);
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

  // Show backdrop on load
  let frame = document.getElementById('backdropFrame');
  if (frame) frame.style.display = 'block';
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
    drawScrapbookBody(trackedPeople[id]);
  }
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
    accent: random(360),
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

function drawScrapbookBody(person) {
  if (
    !getPoint(person, "nose") ||
    !getPoint(person, "left_shoulder") || !getPoint(person, "right_shoulder") ||
    !getPoint(person, "left_hip")      || !getPoint(person, "right_hip") ||
    !getPoint(person, "left_elbow")    || !getPoint(person, "right_elbow") ||
    !getPoint(person, "left_wrist")    || !getPoint(person, "right_wrist") ||
    !getPoint(person, "left_knee")     || !getPoint(person, "right_knee") ||
    !getPoint(person, "left_ankle")    || !getPoint(person, "right_ankle")
  ) return;

  colorMode(HSL);
  drawBodyAtSnapshot(person, person.smoothPoints, 85, person.accent, person.poseHistory);
  colorMode(RGB);
}

function midpoint(a, b) {
  return createVector((a.x + b.x) / 2, (a.y + b.y) / 2);
}

function getPoint(person, name) {
  return person.smoothPoints[name];
}

/* =========================
   COLOR TRAIL
========================= */

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

