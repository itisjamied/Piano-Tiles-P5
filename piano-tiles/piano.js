let video;
let bodyPose;
let poses = [];

let laneActive = [false, false, false];
let fallingTiles = [];

let spawnInterval = 100;
let tileSpeed = 5;

let score = 0;
let misses = 0;
let hitFlash = 0;
let missFlash = 0;

let hitZoneY;
let laneCount = 3;

let gameState = "start"; // "start", "playing", "win", "gameover"
let winScore = 20;
let maxMisses = 10;

// gesture hold tracking
let startGestureFrames = 0;
let gestureHoldFrames = 20;

// if true, camera acts like a mirror
let mirrorMode = true;

function preload() {
  bodyPose = ml5.bodyPose("BlazePose");
}

function gotPoses(results) {
  poses = results;
}

function setup() {
  createCanvas(1680, 1000);
  // createCanvas(1280, 720);

  // video = createCapture(VIDEO);
  video = createCapture({
  video: {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 },
    facingMode: "user"
  }
});
  video.size(width, height);
  video.hide();

  bodyPose.detectStart(video, gotPoses);

  hitZoneY = height * 0.72;

  textFont("Arial");
}


function draw() {
  background(0);

  drawVideo();

  // reset lane states each frame
  laneActive = [false, false, false];

  let pose = null;
  let leftFoot = null;
  let rightFoot = null;
  let leftAnkle = null;
  let rightAnkle = null;

  if (poses.length > 0) {
    pose = poses[0];

    leftFoot = findKeypoint(pose, "left_foot_index");
    rightFoot = findKeypoint(pose, "right_foot_index");
    leftAnkle = findKeypoint(pose, "left_ankle");
    rightAnkle = findKeypoint(pose, "right_ankle");

    if (!leftFoot) leftFoot = leftAnkle;
    if (!rightFoot) rightFoot = rightAnkle;

    checkLanePress(leftFoot);
    checkLanePress(rightFoot);

    drawFootMarker(leftFoot, color(255, 255, 0));
    drawFootMarker(rightFoot, color(255, 255, 0));
    drawFootMarker(leftAnkle, color(0, 255, 255));
    drawFootMarker(rightAnkle, color(0, 255, 255));
  }

  drawLanes();
  drawHitZone();
  highlightPressedLanes();

  if (gameState === "start") {
    handleStartGesture(pose);
    drawStartScreen();
  } else if (gameState === "playing") {
    runGame();
  } else if (gameState === "win") {
    handleStartGesture(pose);
    drawWinScreen();
  } else if (gameState === "gameover") {
    handleStartGesture(pose);
    drawGameOverScreen();
  }

  drawHUD();
}

function runGame() {
  if (frameCount % spawnInterval === 0) {
    spawnTile();
  }

  updateFallingTiles();

  if (misses >= maxMisses) {
    gameState = "gameover";
  }

  if (score >= winScore) {
    gameState = "win";
  }
}

function resetGame() {
  laneActive = [false, false, false];
  fallingTiles = [];
  score = 0;
  misses = 0;
  startGestureFrames = 0;
  gameState = "playing";
}

/* -------------------------
   VIDEO + MIRRORING
------------------------- */

function drawVideo() {
  if (mirrorMode) {
    push();
    translate(width, 0);
    scale(-1, 1);
    image(video, 0, 0, width, height);
    pop();
  } else {
    image(video, 0, 0, width, height);
  }
}

function screenX(x) {
  return mirrorMode ? width - x : x;
}

/* -------------------------
   POSE HELPERS
------------------------- */

function findKeypoint(pose, name) {
  for (let kp of pose.keypoints) {
    if (kp.name === name && kp.confidence > 0.3) {
      return {
        ...kp,
        drawX: screenX(kp.x)
      };
    }
  }
  return null;
}

function checkLanePress(foot) {
  if (!foot) return;

  let floorThreshold = height * 0.7;

  if (foot.y > floorThreshold) {
    let laneWidth = width / laneCount;
    let laneIndex = floor(foot.drawX / laneWidth);

    if (laneIndex >= 0 && laneIndex < laneCount) {
      laneActive[laneIndex] = true;
    }
  }
}

function drawFootMarker(foot, markerColor) {
  if (!foot) return;

  fill(markerColor);
  noStroke();
  circle(foot.drawX, foot.y, 20);
}

/* -------------------------
   GAME TILES
------------------------- */

function spawnTile() {
  let lane = floor(random(laneCount));

  fallingTiles.push({
    lane: lane,
    y: -120,
    h: 140,
    hit: false,
    judged: false
  });
}

function updateFallingTiles() {
  let laneWidth = width / laneCount;

  for (let tile of fallingTiles) {
    tile.y += tileSpeed;

    let x = tile.lane * laneWidth;

    if (!tile.hit) {
      fill(255, 255, 255, 180);
    } else {
      fill(0, 255, 180, 180);
    }

    stroke(255);
    strokeWeight(2);
    rect(x, tile.y, laneWidth, tile.h, 20);

    let tileCenter = tile.y + tile.h / 2;
    let hitWindowTop = hitZoneY - 50;
    let hitWindowBottom = hitZoneY + 80;

    if (
      !tile.judged &&
      tileCenter > hitWindowTop &&
      tileCenter < hitWindowBottom
    ) {
      if (laneActive[tile.lane]) {
        tile.hit = true;
        tile.judged = true;
        score++;
        hitFlash = 10;
      }
    }

    if (!tile.judged && tile.y > hitZoneY + 120) {
      tile.judged = true;
      misses++;
      missFlash = 15;
    }
  }

  fallingTiles = fallingTiles.filter(tile => tile.y < height + 200);
}

/* -------------------------
   UI DRAWING
------------------------- */

function drawLanes() {
  let laneWidth = width / laneCount;

  for (let i = 0; i < laneCount; i++) {
    stroke(255, 120);
    strokeWeight(3);
    fill(255, 255, 255, 20);
    rect(i * laneWidth, 0, laneWidth, height);
  }
}

function drawHitZone() {
  let laneWidth = width / laneCount;

  for (let i = 0; i < laneCount; i++) {
    stroke(255);
    strokeWeight(3);
    fill(255, 255, 255, 35);
    rect(i * laneWidth, hitZoneY, laneWidth, height - hitZoneY);
  }
}

function highlightPressedLanes() {
  let laneWidth = width / laneCount;

  for (let i = 0; i < laneCount; i++) {
    if (laneActive[i]) {
      fill(0, 255, 255, 120);
      noStroke();
      rect(i * laneWidth, hitZoneY, laneWidth, height - hitZoneY);
    }
  }
}

// function drawHUD() {
//   fill(255);
//   noStroke();
//   textAlign(LEFT, TOP);
//   textSize(32);
//   text("Score: " + score, 20, 20);
//   text("Misses: " + misses + " / " + maxMisses, 20, 60);

//   if (gameState === "playing") {
//     text("Goal: " + winScore, 20, 100);
//   }
// }

function drawHUD() {
  push();

  textAlign(LEFT, TOP);

  // flashing background glow
  if (hitFlash > 0) {
    fill(0, 255, 100, 40);
    rect(0, 0, width, height);
    hitFlash--;
  }

  if (missFlash > 0) {
    fill(255, 0, 0, 50);
    rect(0, 0, width, height);
    missFlash--;
  }

  // retro panel background
  fill(0, 180);
  noStroke();
  rect(10, 10, 320, 140, 20);

  // glow effect (draw text multiple times slightly offset)
  function glowText(txt, x, y, col) {
    for (let i = 0; i < 6; i++) {
      fill(red(col), green(col), blue(col), 40);
      text(txt, x + random(-2, 2), y + random(-2, 2));
    }
    fill(col);
    text(txt, x, y);
  }

  textSize(20);

  // SCORE
  glowText("SCORE", 30, 30, color(0, 255, 180));
  textSize(52);
  glowText(score + "/" + winScore, 30, 60, color(0, 255, 100));

  // MISSES
  textSize(20);
  glowText("MISSES", 180, 30, color(255, 100, 100));
  textSize(52);
  glowText(misses + "/" + maxMisses, 180, 60, color(255, 0, 0));

  pop();
}

function drawOverlayPanel() {
  fill(0, 180);
  noStroke();
  rect(width * 0.18, height * 0.18, width * 0.64, height * 0.42, 30);
}

function drawStartScreen() {
  drawOverlayPanel();

  fill(255);
  textAlign(CENTER, CENTER);

  textSize(68);
  text("POSE PIANO TILES", width / 2, height * 0.28);

  textSize(30);
  text("Step into the left, middle, and right lanes", width / 2, height * 0.38);
  text("Raise both hands above your head to start", width / 2, height * 0.43);
  text("Miss 10 tiles and it is game over", width / 2, height * 0.48);
  text("Reach " + winScore + " points to win", width / 2, height * 0.53);

  drawGestureProgress();
}

function drawWinScreen() {
  drawOverlayPanel();

  fill(255);
  textAlign(CENTER, CENTER);

  textSize(72);
  text("YOU WIN", width / 2, height * 0.32);

  textSize(34);
  text("Final Score: " + score, width / 2, height * 0.42);
  text("Raise both hands to play again", width / 2, height * 0.50);

  drawGestureProgress();
}

function drawGameOverScreen() {
  drawOverlayPanel();

  fill(255);
  textAlign(CENTER, CENTER);

  textSize(72);
  text("GAME OVER", width / 2, height * 0.32);

  textSize(34);
  text("Score: " + score, width / 2, height * 0.42);
  text("Misses: " + misses, width / 2, height * 0.48);
  text("Raise both hands to restart", width / 2, height * 0.56);

  drawGestureProgress();
}

function drawGestureProgress() {
  let progress = constrain(startGestureFrames / gestureHoldFrames, 0, 1);

  let barW = 320;
  let barH = 20;
  let x = width / 2 - barW / 2;
  let y = height * 0.62;

  stroke(255);
  strokeWeight(2);
  noFill();
  rect(x, y, barW, barH, 10);

  noStroke();
  fill(0, 255, 180);
  rect(x, y, barW * progress, barH, 10);
}

/* -------------------------
   START / RESTART GESTURE
------------------------- */

function handleStartGesture(pose) {
  if (!pose) {
    startGestureFrames = 0;
    return;
  }

  let leftWrist = findKeypoint(pose, "left_wrist");
  let rightWrist = findKeypoint(pose, "right_wrist");
  let nose = findKeypoint(pose, "nose");

  if (!leftWrist || !rightWrist || !nose) {
    startGestureFrames = 0;
    return;
  }

  // smaller y = higher on screen
  let handsUp = leftWrist.y < nose.y && rightWrist.y < nose.y;

  if (handsUp) {
    startGestureFrames++;
  } else {
    startGestureFrames = 0;
  }

  if (startGestureFrames >= gestureHoldFrames) {
    resetGame();
  }
}