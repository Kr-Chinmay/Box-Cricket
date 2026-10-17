"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const loftButton = document.getElementById("loft");
const timingMarker = document.getElementById("timing-marker");
const scoreElement = document.getElementById("score");
const statusElement = document.getElementById("status");
// Lohit is animated as complete, matching body poses. This deliberately replaces the
// old separate, screen-space rotating bat: a cricket stroke must move hands, shoulders,
// hips and bat together through the line of the ball.
const lohitDriveSprites = [
  "lohit-drive-stance-v1.png",
  "lohit-drive-contact-v1.png",
  "lohit-drive-followthrough-v1.png"
].map((src, index) => {
  const image = new Image();
  image.onload = () => {
    if (index === 0) canvas.classList.remove("is-loading");
  };
  image.src = src;
  return image;
});

// Loft preserves the same straight-bat contact frame, but begins from a visibly higher
// backlift and finishes higher/longer rather than enlarging a flat circular bat arc.
const lohitLoftSprites = [
  "lohit-loft-stance-v1.png",
  "lohit-drive-contact-v1.png",
  "lohit-loft-followthrough-v1.png"
].map((src) => {
  const image = new Image();
  image.src = src;
  return image;
});

const bowlerSprite = new Image();
let bowlerSpriteReady = false;
let bowlerSpriteClean = null;
bowlerSprite.onload = () => {
  bowlerSpriteClean = removeChromaMagenta(bowlerSprite);
  bowlerSpriteReady = true;
};
bowlerSprite.src = "underarm-bowler-yellow-v2.png";

// A dedicated open-palm release pose lets the bowler visibly complete an underarm action,
// rather than simply sliding the same still image forward.
const bowlerReleaseSprite = new Image();
let bowlerReleaseSpriteReady = false;
let bowlerReleaseSpriteClean = null;
bowlerReleaseSprite.onload = () => {
  bowlerReleaseSpriteClean = removeChromaMagenta(bowlerReleaseSprite);
  bowlerReleaseSpriteReady = true;
};
bowlerReleaseSprite.src = "underarm-bowler-yellow-release-v1.png";

// The wind-up frame holds the ball behind the bowler's hip, making the delivery read as
// a real underarm swing: set position → back-swing → open-palm release.
const bowlerWindupSprite = new Image();
let bowlerWindupSpriteReady = false;
let bowlerWindupSpriteClean = null;
bowlerWindupSprite.onload = () => {
  bowlerWindupSpriteClean = removeChromaMagenta(bowlerWindupSprite);
  bowlerWindupSpriteReady = true;
};
bowlerWindupSprite.src = "underarm-bowler-yellow-windup-v1.png";

const fielderSprite = new Image();
let fielderSpriteReady = false;
let fielderSpriteClean = null;
fielderSprite.onload = () => {
  // The fielder asset uses a solid magenta key so it can sit naturally inside the arena.
  fielderSpriteClean = removeChromaMagenta(fielderSprite);
  fielderSpriteReady = true;
};
fielderSprite.src = "fielder-yellow-ready-v1.png";

const inwardFielderSprite = new Image();
let inwardFielderSpriteReady = false;
let inwardFielderSpriteClean = null;
inwardFielderSprite.onload = () => {
  inwardFielderSpriteClean = removeChromaMagenta(inwardFielderSprite);
  inwardFielderSpriteReady = true;
};
inwardFielderSprite.src = "fielder-yellow-facing-batter-v1.png";

// This is the approved wide-box footprint: a further 25% wider than the first arena
// expansion, with the front wall set deeper into the court. The pitch and player
// coordinates remain unchanged, so the extra area belongs to the box and fielders.
const court = { halfWidth: 19.7, nearZ: -12, farZ: 22, ceiling: 12 };
// The taller front wall remains evenly split: 4 in the lower half and 6 in the upper half.
const frontWallScoreDivider = court.ceiling / 2;
// Compact underarm box-cricket pitch: the bowling end is deliberately much closer than the first prototype.
const battingStumpsZ = -7.5;
const bowlingStumpsZ = 3.0;
const bowlingPoppingCreaseZ = bowlingStumpsZ - 1.25;
// Ball is reduced again for the compact underarm court, both visually and physically.
const ball = { x: 0, y: 1.25, z: battingStumpsZ, vx: 0, vy: 0, vz: 0, radius: 0.0672 };
const delivery = { phase: "held", nextAt: 0, windupAt: 0, releasedAt: 0, bounced: false };
const deliveryDelayMs = 2200;
const deliveryWindupMs = 750;
// Open with the shot guide 30° toward leg side (screen-left), clear of the bowler and front-wall labels.
const defaultShotAngle = -30 * Math.PI / 180;
let shotAngle = defaultShotAngle;
let swipeStart = null;
let loftSelected = false;
let timingPosition = 0.5;
let timingRunning = true;
let timingStartedAt = performance.now();
let score = 0;
let wickets = 0;
let inPlay = false;
let scoredThisBall = false;
let resetTime = 0;
let lastFrame = performance.now();
const driveAnimation = { active: false, startedAt: 0, duration: 420, lofted: false };

function resizeCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const bounds = canvas.getBoundingClientRect();
  canvas.width = Math.round(bounds.width * ratio);
  canvas.height = Math.round(bounds.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function size() {
  const rect = canvas.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

// Eye-level wicketkeeper-view projection. The virtual camera is behind the batting stumps,
// around a batter's head height, and tilted slightly towards the far end of the court.
function project(x, y, z) {
  const { width, height } = size();
  const cameraHeight = 5.3;
  // Close to the batting wicket: this is the wicketkeeper's viewing position, not the back wall.
  const cameraZ = -11.5;
  const pitch = -0.205;
  const dy = y - cameraHeight;
  const dz = z - cameraZ;
  // Rotate the court into the camera's slightly downward viewing direction.
  const viewY = dy * Math.cos(pitch) - dz * Math.sin(pitch);
  const viewZ = Math.max(0.5, dy * Math.sin(pitch) + dz * Math.cos(pitch));
  const focal = height * 0.38;
  const scale = Math.min(1.65, 14 / viewZ);
  return {
    x: width / 2 + x / viewZ * focal,
    y: height * 0.47 - viewY / viewZ * focal,
    scale
  };
}

function polygon(points, fill, stroke = null, width = 1) {
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function drawCourt() {
  const { width, height } = size();
  ctx.clearRect(0, 0, width, height);
  const backdrop = ctx.createLinearGradient(0, 0, 0, height);
  backdrop.addColorStop(0, "#010202");
  backdrop.addColorStop(0.5, "#050908");
  backdrop.addColorStop(1, "#07150a");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, width, height);

  const nearLeft = project(-court.halfWidth, 0, court.nearZ);
  const nearRight = project(court.halfWidth, 0, court.nearZ);
  const farLeft = project(-court.halfWidth, 0, court.farZ);
  const farRight = project(court.halfWidth, 0, court.farZ);
  const frontTopLeft = project(-court.halfWidth, court.ceiling, court.farZ);
  const frontTopRight = project(court.halfWidth, court.ceiling, court.farZ);
  const frontMiddleLeft = project(-court.halfWidth, frontWallScoreDivider, court.farZ);
  const frontMiddleRight = project(court.halfWidth, frontWallScoreDivider, court.farZ);
  const leftTopNear = project(-court.halfWidth, court.ceiling, court.nearZ);
  const rightTopNear = project(court.halfWidth, court.ceiling, court.nearZ);

  // The roof fills the upper arena, not merely a thin strip above the front wall.
  drawArenaRoof();
  polygon([leftTopNear, rightTopNear, frontTopRight, frontTopLeft], "#030405");
  drawCeilingLights();

  const turf = ctx.createLinearGradient(0, height * 0.34, 0, height);
  turf.addColorStop(0, "#315f22");
  turf.addColorStop(0.55, "#173c19");
  turf.addColorStop(1, "#0b230e");
  fillClippedPolygon([nearLeft, nearRight, farRight, farLeft], turf);
  polygon([nearLeft, nearRight, farRight, farLeft], null, "#6f9b4d", 1.2);
  drawTurfStripes();

  // Camera is behind a right-handed batter: screen left is leg side; screen right is off side.
  const leftMiddleNear = project(-court.halfWidth, frontWallScoreDivider, court.nearZ);
  const leftMiddleFar = project(-court.halfWidth, frontWallScoreDivider, court.farZ);
  const rightMiddleNear = project(court.halfWidth, frontWallScoreDivider, court.nearZ);
  const rightMiddleFar = project(court.halfWidth, frontWallScoreDivider, court.farZ);
  polygon([nearLeft, farLeft, leftMiddleFar, leftMiddleNear], "#17120e", "#ff7b24", 1.2);
  polygon([leftMiddleNear, leftMiddleFar, frontTopLeft, leftTopNear], "#110e0c", "#b94b14", 1.2);
  polygon([nearRight, rightMiddleNear, rightMiddleFar, farRight], "#101419", "#1383ff", 1.2);
  polygon([rightMiddleNear, rightTopNear, frontTopRight, rightMiddleFar], "#0d1014", "#0d62cb", 1.2);
  polygon([farLeft, farRight, frontTopRight, frontTopLeft], "#121518", "#d7b72d", 1.6);

  // Neon framework and gold scoring dividers distinguish all scoring zones.
  drawNeonLine(nearLeft, farLeft, "#ff7924", 3);
  drawNeonLine(leftTopNear, frontTopLeft, "#ff7924", 3);
  drawNeonLine(nearRight, farRight, "#147eff", 3);
  drawNeonLine(rightTopNear, frontTopRight, "#147eff", 3);
  drawNeonLine(leftMiddleNear, leftMiddleFar, "#d5b62a", 2);
  drawNeonLine(rightMiddleNear, rightMiddleFar, "#d5b62a", 2);
  drawNeonLine(farLeft, farRight, "#d5b62a", 2);
  // Front-wall scoring divider: 4 below this line, 6 above it.
  drawNeonLine(frontMiddleLeft, frontMiddleRight, "#d5b62a", 2);

  // Pitch and creases.
  const pitchNearLeft = project(-1.6, 0.02, battingStumpsZ + 0.3);
  const pitchNearRight = project(1.6, 0.02, battingStumpsZ + 0.3);
  const pitchFarRight = project(1.6, 0.02, bowlingStumpsZ);
  const pitchFarLeft = project(-1.6, 0.02, bowlingStumpsZ);
  polygon([pitchNearLeft, pitchNearRight, pitchFarRight, pitchFarLeft], "rgba(146, 161, 92, 0.25)");
  // Batting crease: bowling crease under the stumps, popping crease in front, and return creases either side.
  drawLine(project(-2.2, 0.03, battingStumpsZ), project(2.2, 0.03, battingStumpsZ), "#f6f6e8", 2.4);
  drawLine(project(-2.2, 0.03, battingStumpsZ + 1.25), project(2.2, 0.03, battingStumpsZ + 1.25), "#f6f6e8", 1.8);
  drawLine(project(-2.2, 0.03, battingStumpsZ - 1.5), project(-2.2, 0.03, battingStumpsZ + 1.25), "#f6f6e8", 1.8);
  drawLine(project(2.2, 0.03, battingStumpsZ - 1.5), project(2.2, 0.03, battingStumpsZ + 1.25), "#f6f6e8", 1.8);
  // Bowling end: short stump-line, wider popping crease towards Lohit, and two return creases.
  // This mirrors the natural far-end geometry in the approved underarm-bowling reference.
  drawLine(project(-1.35, 0.03, bowlingStumpsZ), project(1.35, 0.03, bowlingStumpsZ), "#f6f6e8", 2.4);
  drawLine(project(-2.2, 0.03, bowlingPoppingCreaseZ), project(2.2, 0.03, bowlingPoppingCreaseZ), "#f6f6e8", 1.8);
  drawLine(project(-2.2, 0.03, bowlingPoppingCreaseZ), project(-2.2, 0.03, bowlingStumpsZ + 0.65), "#f6f6e8", 1.8);
  drawLine(project(2.2, 0.03, bowlingPoppingCreaseZ), project(2.2, 0.03, bowlingStumpsZ + 0.65), "#f6f6e8", 1.8);

  // The stationary underarm bowler is placed at the far bowling crease. There is deliberately no run-up.
  drawBowler();
  drawWicket(bowlingStumpsZ, 1.45);
  drawFielders();
  // Keep the arena clean while Lohit's first 3D pose loads—never show the old 2D fallback.
  if (lohitDriveSprites[0].complete && lohitDriveSprites[0].naturalWidth) {
    drawShotGuide();
    drawBatter();
  }
  // The batting wicket is closest to the camera, so it is drawn after the batter.
  drawWicket(battingStumpsZ, 2.0, true);

  drawWallLabel("6", 0, court.ceiling * 0.75, court.farZ, "#f2c947", 32);
  drawWallLabel("4", 0, court.ceiling * 0.25, court.farZ, "#f2c947", 32);
  // Keep the side-wall scores inside the widened arena, between the near-wall and deep fielders.
  const sideWallLabelX = court.halfWidth - 2.5;
  const sideWallLabelZ = 10.2;
  drawWallLabel("2", -sideWallLabelX, 7.8, sideWallLabelZ, "#ffad65", 25);
  drawWallLabel("1", -sideWallLabelX, 3.0, sideWallLabelZ, "#ffad65", 25);
  drawWallLabel("2", sideWallLabelX, 7.8, sideWallLabelZ, "#62a6ff", 25);
  drawWallLabel("1", sideWallLabelX, 3.0, sideWallLabelZ, "#62a6ff", 25);

}

function batterLayout() {
  // Stand close to the batting stumps: the right/back foot remains within the popping crease.
  const feet = project(-0.44, 0, battingStumpsZ + 0.15);
  const scale = Math.max(0.85, Math.min(1.28, feet.scale));
  // Keep Lohit compact relative to the enlarged foreground wicket, as in the approved arena view.
  const spriteHeight = 132 * scale;
  const spriteWidth = spriteHeight * (2 / 3);
  const spriteX = feet.x - spriteWidth * 0.48;
  const spriteY = feet.y - spriteHeight;
  return {
    feet,
    scale,
    spriteX,
    spriteY,
    spriteWidth,
    spriteHeight,
    // The guide begins at the shared hand/contact area in all three pose frames.
    batContact: { x: spriteX + spriteWidth * 0.63, y: spriteY + spriteHeight * 0.47 }
  };
}

function drawShotGuide() {
  const layout = batterLayout();
  const guideLength = size().height * 0.25;
  const endX = layout.batContact.x + Math.sin(shotAngle) * guideLength;
  const endY = layout.batContact.y - Math.cos(shotAngle) * guideLength;
  ctx.save();
  ctx.strokeStyle = "rgba(242, 201, 71, 0.9)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 6]);
  ctx.beginPath(); ctx.moveTo(layout.batContact.x, layout.batContact.y); ctx.lineTo(endX, endY); ctx.stroke();
  ctx.restore();
}

function drawBatter() {
  const stance = lohitDriveSprites[0];
  if (!stance.complete || !stance.naturalWidth) return;
  const { spriteX, spriteY, spriteWidth, spriteHeight } = batterLayout();
  const frame = getDriveFrame();
  const frames = driveAnimation.active && driveAnimation.lofted ? lohitLoftSprites : lohitDriveSprites;
  const sprite = frames[frame];
  // If a later frame is unavailable during the first network load, remain on the proper
  // stance frame rather than flashing an old 2D batter or canvas bat.
  ctx.drawImage(sprite.complete && sprite.naturalWidth ? sprite : stance, spriteX, spriteY, spriteWidth, spriteHeight);
}

function getDriveFrame(now = performance.now()) {
  if (!driveAnimation.active) return 0;
  const progress = (now - driveAnimation.startedAt) / driveAnimation.duration;
  if (progress < 0.18) return 0; // raised backlift and decision point
  if (progress < 0.56) return 1; // hands and full face travel through the ball
  if (progress < 1) return 2; // balanced, high forward/upward follow-through
  driveAnimation.active = false;
  return 0;
}

function drawBowler() {
  if (!bowlerSpriteReady) return;
  // In this wicketkeeper-view layout, over the wicket is the screen-right side of the far stumps.
  // He remains beyond the bowling crease, facing Lohit, with no run-up.
  // The lower screen-right shoe is his forward left foot: place it directly on the popping crease.
  // The naturally higher screen-left shoe then reads as the trailing right foot beside the far stumps.
  // A three-frame underarm action: set with ball, swing back with ball, then open palm.
  const releaseProgress = getBowlerReleaseProgress();
  const feet = project(2.05, 0, bowlingPoppingCreaseZ - releaseProgress * 0.34);
  const scale = Math.max(0.72, Math.min(1.05, feet.scale));
  const spriteHeight = 76 * scale;
  const spriteWidth = spriteHeight * (2 / 3);
  const spriteX = feet.x - spriteWidth / 2;
  // The generated image has a small bottom margin; this anchors its actual shoes on the turf.
  const spriteY = feet.y - spriteHeight * 0.92;
  const sprite = delivery.phase === "windup" && bowlerWindupSpriteReady
    ? (bowlerWindupSpriteClean || bowlerWindupSprite)
    : (delivery.phase === "incoming" || delivery.phase === "wicketHit") && bowlerReleaseSpriteReady
      ? (bowlerReleaseSpriteClean || bowlerReleaseSprite)
      : (bowlerSpriteClean || bowlerSprite);
  ctx.drawImage(sprite, spriteX, spriteY, spriteWidth, spriteHeight);
}

function drawFielders() {
  // Two deep fielders protect the front wall. The side-wall pair use a separate front
  // three-quarter pose, so their chest, feet, and eyes all face Lohit.
  if (fielderSpriteReady) {
    drawFielder({ x: -11.2, z: 17.8, height: 118, mirror: false }, fielderSpriteClean || fielderSprite);
    drawFielder({ x: 11.2, z: 17.8, height: 118, mirror: true }, fielderSpriteClean || fielderSprite);
  }
  if (inwardFielderSpriteReady) {
    drawFielder({ x: -12.4, z: -0.2, height: 80, mirror: false }, inwardFielderSpriteClean || inwardFielderSprite);
    drawFielder({ x: 12.4, z: -0.2, height: 80, mirror: true }, inwardFielderSpriteClean || inwardFielderSprite);
  }
}

function drawFielder(fielder, image) {
    const feet = project(fielder.x, 0, fielder.z);
    const scale = Math.max(0.42, Math.min(1.18, feet.scale));
    const spriteHeight = fielder.height * scale;
    const spriteWidth = spriteHeight * (2 / 3);
    const spriteX = feet.x - spriteWidth / 2;
    const spriteY = feet.y - spriteHeight * 0.91;

    ctx.save();
    if (fielder.mirror) {
      ctx.translate(spriteX + spriteWidth, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, spriteY, spriteWidth, spriteHeight);
    } else {
      ctx.drawImage(image, spriteX, spriteY, spriteWidth, spriteHeight);
    }
    ctx.restore();
}

function removeChromaMagenta(image) {
  const source = document.createElement("canvas");
  source.width = image.naturalWidth;
  source.height = image.naturalHeight;
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  sourceContext.drawImage(image, 0, 0);
  const pixels = sourceContext.getImageData(0, 0, source.width, source.height);
  const { data } = pixels;

  for (let offset = 0; offset < data.length; offset += 4) {
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    // Only the deliberately magenta keyed backdrop has both strong red/blue and very little green.
    if (red > 170 && blue > 120 && green < 115 && red - green > 95 && blue - green > 55) {
      data[offset + 3] = 0;
    }
  }

  sourceContext.putImageData(pixels, 0, 0);
  return source;
}

function fillClippedPolygon(points, fill) {
  ctx.save();
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size().width, size().height);
  ctx.restore();
}

function drawArenaRoof() {
  const { width, height } = size();
  const roof = ctx.createLinearGradient(0, 0, 0, height * 0.48);
  roof.addColorStop(0, "#020303");
  roof.addColorStop(0.64, "#050708");
  roof.addColorStop(1, "#0a0d0e");
  ctx.fillStyle = roof;
  ctx.fillRect(0, 0, width, height * 0.5);
  drawRoofChannels();
}

function drawCeilingLights() {
  const { width, height } = size();
  // Recessed roof lights begin larger over the wicketkeeper and converge towards the front wall.
  for (let row = 0; row < 11; row += 1) {
    const depth = row / 10;
    const y = height * (0.06 + depth * 0.28);
  // Broaden the near rows to follow the expanded side-wall and roof footprint.
  const spread = width * (0.46 * Math.pow(1 - depth, 1.32) + 0.016);
    [-1, -0.48, 0, 0.48, 1].forEach((column) => {
      drawCeilingLight(width / 2 + column * spread, y, depth);
    });
  }
}

function drawCeilingLight(x, y, depth) {
  const radius = Math.max(0.85, 3.25 * Math.pow(1 - depth, 1.4) + 0.8);
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.1);
  glow.addColorStop(0, "rgba(255, 252, 222, .62)");
  glow.addColorStop(0.28, "rgba(255, 240, 174, .24)");
  glow.addColorStop(1, "rgba(255, 238, 153, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(x, y, radius * 3.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1a1b1b";
  ctx.beginPath(); ctx.ellipse(x, y, radius * 1.75, radius * 0.88, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff6d3";
  ctx.beginPath(); ctx.ellipse(x, y, radius, radius * 0.48, 0, 0, Math.PI * 2); ctx.fill();
}

function drawRoofChannels() {
  const { width, height } = size();
  const vanishingPoint = { x: width / 2, y: height * 0.35 };
  [-0.94, -0.47, 0, 0.47, 0.94].forEach((position) => {
    ctx.beginPath();
    ctx.moveTo(width / 2 + position * width * 0.5, 0);
    ctx.lineTo(vanishingPoint.x + position * 7, vanishingPoint.y);
    ctx.strokeStyle = "rgba(70, 75, 76, .32)";
    ctx.lineWidth = position === 0 ? 1.3 : 0.8;
    ctx.stroke();
  });
}

function drawTurfStripes() {
  for (let z = -9.5; z < court.farZ; z += 3.2) {
    const left = project(-court.halfWidth, 0.01, z);
    const right = project(court.halfWidth, 0.01, z);
    drawLine(left, right, "rgba(169, 207, 91, .13)", 1);
  }
}

function drawNeonLine(a, b, color, lineWidth) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 9;
  drawLine(a, b, color, lineWidth);
  ctx.restore();
}

function drawLine(a, b, color, lineWidth) {
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.stroke();
}

function interpolatePoint(from, to, amount) {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount
  };
}

function drawWicket(z, heightWorld, canBreak = false) {
  const baseCentre = project(0, 0.015, z);
  const shadowWidth = Math.max(5, 17 * baseCentre.scale);
  const isBroken = canBreak && delivery.phase === "wicketHit";
  // The wicket falls quickly at impact, then remains dismantled long enough to read clearly.
  const breakProgress = isBroken
    ? Math.min(1, Math.max(0, (performance.now() - delivery.resultAt) / 260))
    : 0;
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, .42)";
  ctx.beginPath();
  ctx.ellipse(baseCentre.x + shadowWidth * 0.16, baseCentre.y + 3, shadowWidth, Math.max(1.5, shadowWidth * 0.16), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const tops = [];
  const fallenTopTargets = [
    project(-0.92, 0.14, z - 0.28),
    project(0.14, 0.1, z - 0.86),
    project(0.86, 0.14, z - 0.32)
  ];
  [-0.28, 0, 0.28].forEach((offset, index) => {
    const base = project(offset, 0, z);
    const uprightTop = project(offset, heightWorld, z);
    const top = isBroken
      ? interpolatePoint(uprightTop, fallenTopTargets[index], breakProgress)
      : uprightTop;
    tops.push(top);
    const width = Math.max(2, 3.7 * base.scale);
    ctx.save();
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(0, 0, 0, .48)";
    ctx.shadowBlur = Math.max(1, 2 * base.scale);
    drawLine(base, top, "#542708", width);
    ctx.shadowBlur = 0;
    drawLine({ x: base.x - width * 0.17, y: base.y }, { x: top.x - width * 0.17, y: top.y }, "#ba7229", Math.max(1, width * 0.38));
    drawLine({ x: base.x + width * 0.2, y: base.y }, { x: top.x + width * 0.2, y: top.y }, "#7a3c10", Math.max(1, width * 0.22));
    ctx.restore();
  });
  if (!isBroken) {
    drawBail(tops[0], tops[1]);
    drawBail(tops[1], tops[2]);
    return;
  }

  // The bails leave the wicket separately, rather than staying attached to the falling stumps.
  const firstBailStart = interpolatePoint(project(-0.24, heightWorld, z), project(-1.15, 0.46, z - 0.46), breakProgress);
  const firstBailEnd = interpolatePoint(project(-0.04, heightWorld, z), project(-0.58, 0.72, z - 0.92), breakProgress);
  const secondBailStart = interpolatePoint(project(0.04, heightWorld, z), project(0.54, 0.76, z - 0.78), breakProgress);
  const secondBailEnd = interpolatePoint(project(0.24, heightWorld, z), project(1.18, 0.42, z - 0.36), breakProgress);
  drawBail(firstBailStart, firstBailEnd);
  drawBail(secondBailStart, secondBailEnd);
}

function drawBail(left, right) {
  const lift = Math.max(1.2, Math.abs(right.x - left.x) * 0.13);
  const start = { x: left.x + lift * 0.12, y: left.y - lift };
  const end = { x: right.x - lift * 0.12, y: right.y - lift };
  ctx.save();
  ctx.lineCap = "round";
  drawLine(start, end, "#67300a", Math.max(1.4, lift * 0.48));
  drawLine({ x: start.x, y: start.y - 0.35 }, { x: end.x, y: end.y - 0.35 }, "#d08a36", Math.max(0.8, lift * 0.16));
  ctx.restore();
}

function drawWallLabel(text, x, y, z, color, fontSize) {
  const point = project(x, y, z);
  ctx.fillStyle = color;
  ctx.font = `800 ${Math.max(13, fontSize * point.scale)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, point.x, point.y);
}

function drawBall() {
  // The held and wind-up sprite frames already contain the ball in the bowler's hand.
  // Draw the canvas ball only after his palm opens, so it visibly leaves that hand.
  if (delivery.phase === "held" || delivery.phase === "windup" || delivery.phase === "dead") return;
  const p = project(ball.x, ball.y, ball.z);
  const radius = Math.max(1.4, 5.46 * p.scale);
  const glow = ctx.createRadialGradient(p.x - radius * 0.25, p.y - radius * 0.3, 1, p.x, p.y, radius * 1.25);
  glow.addColorStop(0, "#ff8a8a");
  glow.addColorStop(0.35, "#e13030");
  glow.addColorStop(1, "#720909");
  ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();
  ctx.strokeStyle = "#ffe4ca"; ctx.lineWidth = Math.max(1, radius * 0.12);
  ctx.beginPath(); ctx.arc(p.x, p.y, radius * 0.72, -0.8, 0.75); ctx.stroke();
}

function update(dt) {
  if (delivery.phase === "held" || delivery.phase === "windup" || delivery.phase === "incoming" || delivery.phase === "wicketHit" || delivery.phase === "dead") {
    updateDelivery(dt);
    return;
  }
  updateShot(dt);
}

function getBowlerReleaseProgress(now = performance.now()) {
  if (delivery.phase === "windup") {
    return Math.min(1, Math.max(0, (now - delivery.windupAt) / deliveryWindupMs));
  }
  if (delivery.phase === "incoming") {
    // Ease him back to his set position after the ball leaves his hand.
    return Math.max(0, 1 - (now - delivery.releasedAt) / 260);
  }
  return 0;
}

function bowlerHandPosition(progress = 0) {
  return {
    // Tuned to the visible hand in the new release sprite, rather than to the bowler's feet.
    x: 1.84 - progress * 0.06,
    y: 1.46 + progress * 0.08,
    z: bowlingPoppingCreaseZ + 0.06 - progress * 0.5
  };
}

function placeBallInBowlerHand(progress = 0) {
  const hand = bowlerHandPosition(progress);
  ball.x = hand.x;
  ball.y = hand.y;
  ball.z = hand.z;
  ball.vx = ball.vy = ball.vz = 0;
}

function beginDelivery(now) {
  delivery.phase = "windup";
  delivery.windupAt = now;
  timingRunning = false;
  statusElement.textContent = "Bowler is releasing an underarm delivery…";
}

function releaseDelivery(now) {
  placeBallInBowlerHand(1);
  // A deliberately gentle first-version underarm ball: one clear bounce and enough time
  // for a phone player to see it, judge it, and complete a swipe.
  ball.vx = -0.84;
  ball.vy = 0.9;
  ball.vz = -5.76;
  delivery.bounced = false;
  delivery.phase = "incoming";
  delivery.releasedAt = now;
  timingRunning = true;
  timingStartedAt = now;
  timingPosition = 0.5;
  timingMarker.style.left = "50%";
  statusElement.textContent = "Ball released — swipe as it reaches Lohit.";
}

function isBallPlayable() {
  return delivery.phase === "incoming"
    && ball.z <= battingStumpsZ + 4.2
    // Once it reaches the wicket line, a late batter has missed the ball.
    && ball.z >= battingStumpsZ + 0.18;
}

function updateDelivery(dt) {
  const now = performance.now();
  if (delivery.phase === "held") {
    placeBallInBowlerHand();
    if (now >= delivery.nextAt) beginDelivery(now);
    return;
  }

  if (delivery.phase === "windup") {
    const progress = Math.min(1, (now - delivery.windupAt) / deliveryWindupMs);
    placeBallInBowlerHand(progress);
    if (progress >= 1) releaseDelivery(now);
    return;
  }

  if (delivery.phase === "dead") {
    if (now >= resetTime) resetBall("Bowler has the ball — choose Loft if you want a lofted shot.");
    return;
  }

  if (delivery.phase === "wicketHit") {
    // Keep the ball visibly resting against the wicket for a moment before the reset.
    if (now >= delivery.resultAt + 760) {
      delivery.phase = "dead";
      resetTime = now + 720;
    }
    return;
  }

  // Before its one bounce the ball drops naturally. After that bounce it skids low
  // toward Lohit, preventing the unrealistic second and third bounces.
  if (!delivery.bounced) ball.vy -= 9.8 * dt;
  ball.x += ball.vx * dt;
  if (!delivery.bounced) ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;

  if (!delivery.bounced && ball.y - ball.radius <= 0) {
    ball.y = ball.radius;
    ball.vy = 0;
    ball.vx *= 0.96;
    ball.vz *= 0.96;
    delivery.bounced = true;
  }

  // A late straight ball now resolves naturally at the batting wicket. A ball outside the
  // three-stump width is allowed to continue past Lohit instead of pausing for a swipe.
  if (ball.z <= battingStumpsZ + ball.radius && ball.y <= 2.05 && Math.abs(ball.x) <= 0.43) {
    ball.z = battingStumpsZ + ball.radius;
    ball.y = Math.max(ball.radius * 1.2, ball.y);
    ball.vx = ball.vy = ball.vz = 0;
    delivery.phase = "wicketHit";
    delivery.resultAt = now;
    timingRunning = false;
    wickets += 1;
    scoreElement.textContent = `${score} / ${wickets}`;
    statusElement.textContent = "Bowled! Lohit's stumps are dismantled.";
    return;
  }

  if (ball.z < battingStumpsZ - 1.35) {
    delivery.phase = "dead";
    timingRunning = false;
    resetTime = now + 850;
    statusElement.textContent = "Ball passed Lohit outside the stumps — next delivery coming.";
  }
}

function updateShot(dt) {
  ball.vy -= 9.8 * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;

  if (ball.y - ball.radius <= 0) {
    ball.y = ball.radius;
    ball.vy = Math.abs(ball.vy) * 0.61;
    ball.vx *= 0.9;
    ball.vz *= 0.9;
  }
  if (ball.y + ball.radius >= court.ceiling) {
    ball.y = court.ceiling - ball.radius;
    ball.vy = -Math.abs(ball.vy) * 0.72;
  }
  if (ball.x - ball.radius <= -court.halfWidth || ball.x + ball.radius >= court.halfWidth) {
    const hitLeft = ball.x < 0;
    ball.x = hitLeft ? -court.halfWidth + ball.radius : court.halfWidth - ball.radius;
    if (!scoredThisBall) scoreRuns(ball.y >= frontWallScoreDivider ? 2 : 1);
    ball.vx *= -0.68;
  }
  if (ball.z + ball.radius >= court.farZ) {
    ball.z = court.farZ - ball.radius;
    if (!scoredThisBall) scoreRuns(ball.y >= frontWallScoreDivider ? 6 : 4);
    ball.vz *= -0.68;
  }
  if (ball.z - ball.radius <= court.nearZ) {
    ball.z = court.nearZ + ball.radius;
    ball.vz *= -0.68;
  }
  if (performance.now() >= resetTime || ball.z < court.nearZ + 0.2) resetBall("Bowler has the ball — choose Loft if you want a lofted shot.");
}

function scoreRuns(runs) {
  scoredThisBall = true;
  score += runs;
  scoreElement.textContent = `${score} / ${wickets}`;
  statusElement.textContent = `${runs} run${runs === 1 ? "" : "s"}! First scoring-wall contact is locked.`;
  resetTime = performance.now() + 1450;
}

function launchBall(angle) {
  if (!isBallPlayable()) {
    statusElement.textContent = "Wait for the ball to reach Lohit before playing the shot.";
    return;
  }
  const timing = getTimingResult(timingPosition);
  // Freeze the marker where the player pressed Launch so the result remains visible.
  timingRunning = false;
  // Every current swipe intentionally uses the authentic straight-drive sequence.
  // Direction still controls the ball trajectory; dedicated on/off-side poses come next.
  driveAnimation.active = true;
  driveAnimation.startedAt = performance.now();
  driveAnimation.duration = loftSelected ? 560 : 420;
  driveAnimation.lofted = loftSelected;
  // Pull the delivery into Lohit's contact area before sending it away from the bat.
  ball.x = Math.max(-0.42, Math.min(0.42, ball.x));
  ball.y = Math.max(0.82, ball.y + 0.2);
  ball.z = battingStumpsZ + 0.48;
  // Timing affects accuracy and power. Later, poor timing will also allow misses and catches.
  const shotSpeed = 20.5 * timing.power;
  ball.vx = Math.sin(angle) * shotSpeed * timing.accuracy;
  // A lofted shot has enough height to reach the upper scoring bands without hitting the roof.
  ball.vy = (loftSelected ? 10.2 : 5.9) * timing.power;
  ball.vz = Math.cos(angle) * shotSpeed;
  delivery.phase = "shot";
  inPlay = true;
  scoredThisBall = false;
  resetTime = performance.now() + 6200;
  loftButton.disabled = true;
  statusElement.textContent = `${timing.label} timing — ${loftSelected ? "lofted" : "grounded"} ball in play…`;
}

function getTimingResult(position) {
  const distance = Math.abs(position - 0.5);
  if (distance <= 0.11) return { label: "Perfect", power: 1.05, accuracy: 1 };
  if (distance <= 0.25) return { label: "Good", power: 0.95, accuracy: 0.93 };
  return { label: "Mistimed", power: 0.82, accuracy: 0.72 };
}

function updateTimingGauge(now) {
  // A smooth left-to-right-to-left sweep gives the player a simple timing challenge.
  if (!timingRunning) return;
  timingPosition = (Math.sin((now - timingStartedAt) / 520) + 1) / 2;
  timingMarker.style.left = `${timingPosition * 100}%`;
}

function resetBall(message) {
  delivery.phase = "held";
  delivery.nextAt = performance.now() + deliveryDelayMs;
  delivery.bounced = false;
  placeBallInBowlerHand();
  inPlay = false;
  driveAnimation.active = false;
  driveAnimation.lofted = false;
  timingRunning = false;
  timingPosition = 0.5;
  timingMarker.style.left = "50%";
  loftButton.disabled = false;
  statusElement.textContent = message;
}

function clampShotAngle(angle) {
  const limit = 70 * Math.PI / 180;
  return Math.max(-limit, Math.min(limit, angle));
}

function describeAngle(angle) {
  if (angle < -0.12) return "Leg-side";
  if (angle > 0.12) return "Off-side";
  return "Straight";
}

function startSwipe(event) {
  if (!isBallPlayable()) {
    if (!inPlay) statusElement.textContent = "Wait for the underarm ball to reach Lohit.";
    return;
  }
  const rect = canvas.getBoundingClientRect();
  swipeStart = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  canvas.setPointerCapture?.(event.pointerId);
}

function previewSwipe(event) {
  if (!swipeStart || !isBallPlayable()) return;
  const rect = canvas.getBoundingClientRect();
  const dx = event.clientX - rect.left - swipeStart.x;
  const forward = swipeStart.y - (event.clientY - rect.top);
  if (forward < 8) return;
  shotAngle = clampShotAngle(Math.atan2(dx, forward));
  statusElement.textContent = `${describeAngle(shotAngle)} shot selected — release to play.`;
}

function finishSwipe(event) {
  if (!swipeStart || !isBallPlayable()) return;
  const rect = canvas.getBoundingClientRect();
  const dx = event.clientX - rect.left - swipeStart.x;
  const forward = swipeStart.y - (event.clientY - rect.top);
  swipeStart = null;
  if (forward < 34) {
    statusElement.textContent = "Swipe forward to play a shot.";
    return;
  }
  shotAngle = clampShotAngle(Math.atan2(dx, forward));
  launchBall(shotAngle);
}

function toggleLoft() {
  if (inPlay) return;
  loftSelected = !loftSelected;
  loftButton.classList.toggle("is-selected", loftSelected);
  loftButton.setAttribute("aria-pressed", String(loftSelected));
  loftButton.textContent = loftSelected ? "Loft: On" : "Loft: Off";
  showShotSelection();
}

function showShotSelection() {
  const shotType = loftSelected ? "Lofted" : "Grounded";
  statusElement.textContent = isBallPlayable()
    ? `${shotType} shot selected — swipe forward to play.`
    : `${shotType} shot prepared — wait for the underarm delivery.`;
}

function frame(now) {
  const dt = Math.min(0.033, (now - lastFrame) / 1000);
  lastFrame = now;
  updateTimingGauge(now);
  update(dt);
  drawCourt();
  drawBall();
  requestAnimationFrame(frame);
}

canvas.addEventListener("pointerdown", startSwipe);
canvas.addEventListener("pointermove", previewSwipe);
canvas.addEventListener("pointerup", finishSwipe);
canvas.addEventListener("pointercancel", () => {
  swipeStart = null;
  if (isBallPlayable()) statusElement.textContent = "Swipe forward in the court to play a shot.";
});
loftButton.addEventListener("click", toggleLoft);
window.addEventListener("resize", resizeCanvas);
resizeCanvas();
resetBall("Bowler has the ball — choose Loft if you want a lofted shot.");
requestAnimationFrame(frame);
