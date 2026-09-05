"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const launchButton = document.getElementById("launch");
const loftButton = document.getElementById("loft");
const timingMarker = document.getElementById("timing-marker");
const scoreElement = document.getElementById("score");
const statusElement = document.getElementById("status");

const court = { halfWidth: 9, nearZ: -12, farZ: 16, ceiling: 8 };
// Ball is deliberately 60% of the original prototype size, both visually and physically.
const ball = { x: 0, y: 1.25, z: -7.5, vx: 0, vy: 0, vz: 0, radius: 0.096 };
let aim = 0;
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
  const cameraZ = -16;
  const pitch = -0.205;
  const dy = y - cameraHeight;
  const dz = z - cameraZ;
  // Rotate the court into the camera's slightly downward viewing direction.
  const viewY = dy * Math.cos(pitch) - dz * Math.sin(pitch);
  const viewZ = Math.max(0.5, dy * Math.sin(pitch) + dz * Math.cos(pitch));
  const focal = height * 0.55;
  const scale = Math.min(1.65, 14 / viewZ);
  return {
    x: width / 2 + x / viewZ * focal,
    y: height * 0.5 - viewY / viewZ * focal,
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
  const pitchNearLeft = project(-1.6, 0.02, -7.2);
  const pitchNearRight = project(1.6, 0.02, -7.2);
  const pitchFarRight = project(1.6, 0.02, 12.2);
  const pitchFarLeft = project(-1.6, 0.02, 12.2);
  polygon([pitchNearLeft, pitchNearRight, pitchFarRight, pitchFarLeft], "rgba(146, 161, 92, 0.25)");
  drawLine(project(-2.2, 0.03, -7.5), project(2.2, 0.03, -7.5), "#f6f6e8", 2.4);
  drawLine(project(-2.2, 0.03, -6.25), project(2.2, 0.03, -6.25), "#f6f6e8", 1.8);
  drawLine(project(-2.2, 0.03, 12.2), project(2.2, 0.03, 12.2), "#f6f6e8", 1.6);

  drawWicket(-7.5, 1.18);
  drawWicket(12.2, 1.18);

  drawWallLabel("6", 0, 6.0, court.farZ, "#f2c947", 32);
  drawWallLabel("4", 0, 2.1, court.farZ, "#f2c947", 32);
  drawWallLabel("2", -court.halfWidth, 6.0, 5.3, "#ffad65", 25);
  drawWallLabel("1", -court.halfWidth, 2.1, 5.3, "#ffad65", 25);
  drawWallLabel("2", court.halfWidth, 6.0, 5.3, "#62a6ff", 25);
  drawWallLabel("1", court.halfWidth, 2.1, 5.3, "#62a6ff", 25);

  const laneX = size().width / 2 + aim * size().width * 0.25;
  ctx.strokeStyle = "rgba(242, 201, 71, 0.9)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 6]);
  ctx.beginPath(); ctx.moveTo(size().width / 2, size().height * 0.9); ctx.lineTo(laneX, size().height * 0.6); ctx.stroke();
  ctx.setLineDash([]);
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
  const roof = ctx.createLinearGradient(0, 0, 0, height * 0.54);
  roof.addColorStop(0, "#010202");
  roof.addColorStop(0.62, "#030506");
  roof.addColorStop(1, "#0a0d0e");
  ctx.fillStyle = roof;
  ctx.fillRect(0, 0, width, height * 0.56);
}

function drawCeilingLights() {
  const { width, height } = size();
  // These rows begin large above the wicketkeeper and converge towards the front wall.
  for (let row = 0; row < 10; row += 1) {
    const depth = row / 9;
    const y = height * (0.075 + depth * 0.285);
    const spread = width * (0.43 * Math.pow(1 - depth, 1.32) + 0.016);
    [-1, -0.48, 0, 0.48, 1].forEach((column) => {
      drawCeilingLight(width / 2 + column * spread, y, depth);
    });
  }
}

function drawCeilingLight(x, y, depth) {
  const radius = Math.max(1.15, 4.8 * (1 - depth) + 1.2);
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.6);
  glow.addColorStop(0, "rgba(255, 252, 215, .98)");
  glow.addColorStop(0.22, "rgba(255, 240, 170, .74)");
  glow.addColorStop(1, "rgba(255, 238, 153, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(x, y, radius * 3.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff9da";
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
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
  [-0.18, 0, 0.18].forEach((offset) => {
    const base = project(offset, 0, z);
    const top = project(offset, heightWorld, z);
    drawLine(base, top, "#9b5b1d", Math.max(2, 3.8 * base.scale));
  });
  drawLine(project(-0.18, heightWorld, z), project(0, heightWorld, z), "#e4b073", 2);
  drawLine(project(0, heightWorld, z), project(0.18, heightWorld, z), "#e4b073", 2);
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
  const p = project(ball.x, ball.y, ball.z);
  const radius = Math.max(2, 7.8 * p.scale);
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

function launchBall() {
  if (inPlay) return;
  const timing = getTimingResult(timingPosition);
  // Freeze the marker where the player pressed Launch so the result remains visible.
  timingRunning = false;
  ball.x = 0; ball.y = 1.25; ball.z = -7.5;
  // Timing affects accuracy and power. Later, poor timing will also allow misses and catches.
  ball.vx = aim * (timing.accuracy * 10.5);
  // A lofted shot has enough height to reach the upper scoring bands without hitting the roof.
  ball.vy = (loftSelected ? 10.2 : 5.9) * timing.power;
  ball.vz = 20.5 * timing.power;
  inPlay = true;
  scoredThisBall = false;
  resetTime = performance.now() + 6200;
  launchButton.disabled = true;
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
  ball.x = 0; ball.y = 1.25; ball.z = -7.5;
  ball.vx = ball.vy = ball.vz = 0;
  inPlay = false;
  timingRunning = true;
  timingStartedAt = performance.now();
  launchButton.disabled = false;
  loftButton.disabled = false;
  statusElement.textContent = message;
}

function setAim(event) {
  if (inPlay) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = (event.clientX - rect.left) / rect.width;
  aim = Math.max(-0.86, Math.min(0.86, (ratio - 0.5) * 2));
  showShotSelection();
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
  const lane = aim < -0.25 ? "Leg-side" : aim > 0.25 ? "Off-side" : "Straight";
  statusElement.textContent = `${lane} lane selected — ${loftSelected ? "lofted" : "grounded"} shot ready.`;
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

canvas.addEventListener("pointerdown", setAim);
launchButton.addEventListener("click", launchBall);
loftButton.addEventListener("click", toggleLoft);
window.addEventListener("resize", resizeCanvas);
resizeCanvas();
resetBall("Tap a lane in the court, then launch the ball.");
requestAnimationFrame(frame);
