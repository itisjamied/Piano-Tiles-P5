# Scrapbook Body

An interactive pose-tracking visualization built with **p5.js** and **ml5.js BodyPose**.

## Project Overview

A visual experiment that reconstructs human bodies using image cutouts based on real-time pose data.
- Tracks multiple people simultaneously (up to 5)
- Tracks key joints (shoulders, hips, limbs, etc.)
- Reconstructs bodies using collage-style image cutouts
- Smooth motion tracking with person ID persistence

## How to Run

1. Open the `scrapbook` folder in VS Code
2. Use the **Live Server** extension ("Go Live")

## Tech

- p5.js
- ml5.js (BodyPose / BlazePose)

## Notes

- Uses webcam input
- Pose detection runs in real-time in the browser
- Interactions are based on tracked keypoints (feet, joints, etc.)
