"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const loftButton = document.getElementById("loft");
const timingMarker = document.getElementById("timing-marker");
const scoreElement = document.getElementById("score");
const statusElement = document.getElementById("status");
const lohitSprite = new Image();
let lohitSpriteReady = false;
lohitSprite.onload = () => { lohitSpriteReady = true; };
lohitSprite.src = "lohit-batter-ready-v1.png";

const court = { halfWidth: 9, nearZ: -12, farZ: 16, ceiling: 8 };
// Compact underarm box-cricket pitch: the bowling end is deliberately much closer than the first prototype.
const battingStumpsZ = -7.5;
const bowlingStumpsZ = 3.0;
// Ball is reduced again for the compact underarm court, both visually and physically.
const ball = { x: 0, y: 1.25, z: battingStumpsZ, vx: 0, vy: 0, vz: 0, radius: 0.0672 };
let shotAngle = 0;
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
  const leftMiddleNear = project(-court.halfWidth, 4, court.nearZ);
  const leftMiddleFar = project(-court.halfWidth, 4, court.farZ);
  const rightMiddleNear = project(court.halfWidth, 4, court.nearZ);
  const rightMiddleFar = project(court.halfWidth, 4, court.farZ);
  polygon([nearLeft, farLeft, leftMiddleFar, leftMiddleNear], "#17120e", "#ff7b24", 1.2);
  polygon([leftMiddleNear, leftMiddleFar, frontTopLeft, leftTopNear], "#110e0c", "#b94b14", 1.2);
  polygon([nearRight, rightMiddleNear, rightMiddleFar, farRight], "#101419", "#1383ff", 1.2);
  polygon([rightMiddleNear, rightTopNear, frontTopRight, rightMiddleFar], "#0d1014", "#0d62cb", 1.2);
  polygon([farLeft, farRight, frontTopRight, frontTopLeft], "#121518", "#d7b72d", 1.6);

  drawFrontWallLights();
  // Neon framework and gold scoring dividers distinguish all scoring zones.
  drawNeonLine(nearLeft, farLeft, "#ff7924", 3);
  drawNeonLine(leftTopNear, frontTopLeft, "#ff7924", 3);
  drawNeonLine(nearRight, farRight, "#147eff", 3);
  drawNeonLine(rightTopNear, frontTopRight, "#147eff", 3);
  drawNeonLine(leftMiddleNear, leftMiddleFar, "#d5b62a", 2);
  drawNeonLine(rightMiddleNear, rightMiddleFar, "#d5b62a", 2);
  drawNeonLine(farLeft, farRight, "#d5b62a", 2);

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
  drawLine(project(-2.2, 0.03, bowlingStumpsZ), project(2.2, 0.03, bowlingStumpsZ), "#f6f6e8", 1.8);

  drawWicket(bowlingStumpsZ, 1.18);
  drawShotGuide();
  drawBatter();
  // The batting wicket is closest to the camera, so it is drawn after the batter.
  drawWicket(battingStumpsZ, 1.5);

  drawWallLabel("6", 0, 6.0, court.farZ, "#f2c947", 32);
  drawWallLabel("4", 0, 2.1, court.farZ, "#f2c947", 32);
  drawWallLabel("2", -court.halfWidth, 6.0, 5.3, "#ffad65", 25);
  drawWallLabel("1", -court.halfWidth, 2.1, 5.3, "#ffad65", 25);
  drawWallLabel("2", court.halfWidth, 6.0, 5.3, "#62a6ff", 25);
  drawWallLabel("1", court.halfWidth, 2.1, 5.3, "#62a6ff", 25);

}

function batterLayout() {
  const feet = project(-0.44, 0, battingStumpsZ + 1.25);
  const scale = Math.max(0.85, Math.min(1.28, feet.scale));
  const spriteHeight = 164 * scale;
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
    // Right-handed Lohit's bat rests on screen-right when viewed from behind.
    batContact: lohitSpriteReady
      ? { x: spriteX + spriteWidth * 0.70, y: spriteY + spriteHeight * 0.58 }
      : { x: feet.x + 43 * scale, y: feet.y - 67 * scale }
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
  if (!lohitSpriteReady) {
    drawBatterFallback();
    return;
  }
  const { spriteX, spriteY, spriteWidth, spriteHeight } = batterLayout();
  // The generator returned a dark studio backdrop. These two silhouette clips retain only Lohit and his bat.
  // This is a proper waiting stance: flexed knees, planted feet, and a lowered bat.
  drawSpriteMask(spriteX, spriteY, spriteWidth, spriteHeight, [
    [0.52, 0.01], [0.72, 0.04], [0.79, 0.17], [0.74, 0.27], [0.72, 0.42],
    [0.70, 0.55], [0.74, 0.72], [0.73, 0.94], [0.67, 0.99], [0.49, 0.99],
    [0.46, 0.87], [0.38, 0.95], [0.17, 0.98], [0.12, 0.91], [0.21, 0.67],
    [0.26, 0.53], [0.27, 0.38], [0.35, 0.22], [0.45, 0.13]
  ]);
  drawSpriteMask(spriteX, spriteY, spriteWidth, spriteHeight, [
    [0.66, 0.49], [0.75, 0.47], [0.96, 0.94], [0.89, 0.99], [0.62, 0.64]
  ]);
}

function drawSpriteMask(x, y, width, height, points) {
  ctx.save();
  ctx.beginPath();
  points.forEach(([px, py], index) => {
    const pointX = x + px * width;
    const pointY = y + py * height;
    index ? ctx.lineTo(pointX, pointY) : ctx.moveTo(pointX, pointY);
  });
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(lohitSprite, x, y, width, height);
  ctx.restore();
}

function drawBatterFallback() {
  const { feet, scale, batContact } = batterLayout();
  const s = scale;
  const waistY = feet.y - 47 * s;
  const shoulderY = feet.y - 98 * s;
  const headY = feet.y - 118 * s;

  // Ground shadow makes the player feel planted on the turf.
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, .38)";
  ctx.beginPath(); ctx.ellipse(feet.x, feet.y + 3, 34 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();

  // Blue trousers, orange side stripe, and pale pads.
  polygon([
    { x: feet.x - 23 * s, y: waistY }, { x: feet.x - 5 * s, y: waistY },
    { x: feet.x - 11 * s, y: feet.y }, { x: feet.x - 29 * s, y: feet.y }
  ], "#0b4e96", "#092e5b", 1);
  polygon([
    { x: feet.x + 2 * s, y: waistY }, { x: feet.x + 20 * s, y: waistY },
    { x: feet.x + 29 * s, y: feet.y }, { x: feet.x + 10 * s, y: feet.y }
  ], "#0b4e96", "#092e5b", 1);
  drawLine({ x: feet.x - 8 * s, y: waistY + 4 * s }, { x: feet.x - 18 * s, y: feet.y - 3 * s }, "#ef7e28", 3 * s);
  drawLine({ x: feet.x + 11 * s, y: waistY + 4 * s }, { x: feet.x + 20 * s, y: feet.y - 3 * s }, "#ef7e28", 3 * s);
  ctx.fillStyle = "#d7d8cf";
  ctx.fillRect(feet.x - 29 * s, feet.y - 9 * s, 19 * s, 9 * s);
  ctx.fillRect(feet.x + 10 * s, feet.y - 9 * s, 20 * s, 9 * s);

  // Fictional blue-and-orange team jersey, viewed from behind.
  polygon([
    { x: feet.x - 32 * s, y: shoulderY + 8 * s }, { x: feet.x + 29 * s, y: shoulderY + 8 * s },
    { x: feet.x + 24 * s, y: waistY + 7 * s }, { x: feet.x - 26 * s, y: waistY + 7 * s }
  ], "#0754a3", "#062d5e", 1.2);
  polygon([
    { x: feet.x - 27 * s, y: waistY - 12 * s }, { x: feet.x + 25 * s, y: waistY - 12 * s },
    { x: feet.x + 24 * s, y: waistY + 7 * s }, { x: feet.x - 26 * s, y: waistY + 7 * s }
  ], "#ee7928");
  ctx.fillStyle = "#f7f4dc";
  ctx.font = `800 ${Math.max(9, 11 * s)}px system-ui`;
  ctx.textAlign = "center";
  ctx.fillText("LOHIT", feet.x - 1 * s, shoulderY + 32 * s);

  // Helmet and neck.
  ctx.fillStyle = "#b46a3a";
  ctx.fillRect(feet.x - 7 * s, shoulderY - 4 * s, 14 * s, 13 * s);
  ctx.fillStyle = "#0a4c92";
  ctx.beginPath(); ctx.arc(feet.x - 2 * s, headY + 7 * s, 20 * s, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillRect(feet.x - 21 * s, headY + 6 * s, 38 * s, 13 * s);
  drawLine({ x: feet.x + 16 * s, y: headY + 14 * s }, { x: feet.x + 28 * s, y: headY + 15 * s }, "#8fa2ad", 1.3 * s);

  // Right arm, glove, and raised bat.
  drawLine({ x: feet.x + 22 * s, y: shoulderY + 18 * s }, { x: feet.x + 39 * s, y: waistY - 12 * s }, "#0754a3", 11 * s);
  ctx.fillStyle = "#d9ded9";
  ctx.beginPath(); ctx.arc(feet.x + 40 * s, waistY - 13 * s, 7 * s, 0, Math.PI * 2); ctx.fill();
  drawLine({ x: feet.x + 41 * s, y: waistY - 15 * s }, { x: batContact.x - 6 * s, y: batContact.y + 6 * s }, "#5d3415", 3 * s);
  polygon([
    { x: batContact.x - 7 * s, y: batContact.y + 9 * s }, { x: batContact.x + 8 * s, y: batContact.y + 13 * s },
    { x: batContact.x + 39 * s, y: batContact.y - 51 * s }, { x: batContact.x + 22 * s, y: batContact.y - 56 * s }
  ], "#d6ab72", "#875b2b", 1.2);
  ctx.restore();
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
  for (let row = 0; row < 9; row += 1) {
    const depth = row / 8;
    const y = height * (0.07 + depth * 0.265);
    const spread = width * (0.43 * Math.pow(1 - depth, 1.32) + 0.016);
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
    ctx.moveTo(width / 2 + position * width * 0.47, 0);
    ctx.lineTo(vanishingPoint.x + position * 7, vanishingPoint.y);
    ctx.strokeStyle = "rgba(70, 75, 76, .32)";
    ctx.lineWidth = position === 0 ? 1.3 : 0.8;
    ctx.stroke();
  });
}

function drawFrontWallLights() {
  [-5.6, -2.8, 0, 2.8, 5.6].forEach((x) => {
    const point = project(x, 3.9, court.farZ - 0.02);
    const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, 24 * point.scale);
    glow.addColorStop(0, "rgba(255, 246, 202, .26)");
    glow.addColorStop(1, "rgba(255, 246, 202, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(point.x, point.y, 24 * point.scale, 0, Math.PI * 2); ctx.fill();
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

function drawWicket(z, heightWorld) {
  const baseCentre = project(0, 0.015, z);
  const shadowWidth = Math.max(5, 17 * baseCentre.scale);
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, .42)";
  ctx.beginPath();
  ctx.ellipse(baseCentre.x + shadowWidth * 0.16, baseCentre.y + 3, shadowWidth, Math.max(1.5, shadowWidth * 0.16), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const tops = [];
  [-0.28, 0, 0.28].forEach((offset) => {
    const base = project(offset, 0, z);
    const top = project(offset, heightWorld, z);
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
  drawBail(tops[0], tops[1]);
  drawBail(tops[1], tops[2]);
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
  // Before a delivery, the bowler is assumed to be holding the ball off-screen.
  if (!inPlay) return;
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
  if (!inPlay) return;
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
    if (!scoredThisBall) scoreRuns(ball.y >= 4 ? 2 : 1);
    ball.vx *= -0.68;
  }
  if (ball.z + ball.radius >= court.farZ) {
    ball.z = court.farZ - ball.radius;
    if (!scoredThisBall) scoreRuns(ball.y >= 4 ? 6 : 4);
    ball.vz *= -0.68;
  }
  if (ball.z - ball.radius <= court.nearZ) {
    ball.z = court.nearZ + ball.radius;
    ball.vz *= -0.68;
  }
  if (performance.now() >= resetTime || ball.z < court.nearZ + 0.2) resetBall("Ready for the next physics test.");
}

function scoreRuns(runs) {
  scoredThisBall = true;
  score += runs;
  scoreElement.textContent = `${score} / ${wickets}`;
  statusElement.textContent = `${runs} run${runs === 1 ? "" : "s"}! First scoring-wall contact is locked.`;
  resetTime = performance.now() + 1450;
}

function launchBall(angle) {
  if (inPlay) return;
  const timing = getTimingResult(timingPosition);
  // Freeze the marker where the player pressed Launch so the result remains visible.
  timingRunning = false;
  ball.x = 0; ball.y = 1.25; ball.z = battingStumpsZ;
  // Timing affects accuracy and power. Later, poor timing will also allow misses and catches.
  const shotSpeed = 20.5 * timing.power;
  ball.vx = Math.sin(angle) * shotSpeed * timing.accuracy;
  // A lofted shot has enough height to reach the upper scoring bands without hitting the roof.
  ball.vy = (loftSelected ? 10.2 : 5.9) * timing.power;
  ball.vz = Math.cos(angle) * shotSpeed;
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
  ball.x = 0; ball.y = 1.25; ball.z = battingStumpsZ;
  ball.vx = ball.vy = ball.vz = 0;
  inPlay = false;
  timingRunning = true;
  timingStartedAt = performance.now();
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
  if (inPlay) return;
  const rect = canvas.getBoundingClientRect();
  swipeStart = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  canvas.setPointerCapture?.(event.pointerId);
}

function previewSwipe(event) {
  if (!swipeStart || inPlay) return;
  const rect = canvas.getBoundingClientRect();
  const dx = event.clientX - rect.left - swipeStart.x;
  const forward = swipeStart.y - (event.clientY - rect.top);
  if (forward < 8) return;
  shotAngle = clampShotAngle(Math.atan2(dx, forward));
  statusElement.textContent = `${describeAngle(shotAngle)} shot selected — release to play.`;
}

function finishSwipe(event) {
  if (!swipeStart || inPlay) return;
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
  statusElement.textContent = `${loftSelected ? "Lofted" : "Grounded"} shot selected — swipe forward to play.`;
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
  if (!inPlay) statusElement.textContent = "Swipe forward in the court to play a shot.";
});
loftButton.addEventListener("click", toggleLoft);
window.addEventListener("resize", resizeCanvas);
resizeCanvas();
resetBall("Swipe forward in the court to play a shot.");
requestAnimationFrame(frame);
