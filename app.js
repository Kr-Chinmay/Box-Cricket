"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const launchButton = document.getElementById("launch");
const scoreElement = document.getElementById("score");
const statusElement = document.getElementById("status");

const court = { halfWidth: 9, nearZ: -12, farZ: 16, ceiling: 8 };
// Ball is deliberately 60% of the original prototype size, both visually and physically.
const ball = { x: 0, y: 1.25, z: -7.5, vx: 0, vy: 0, vz: 0, radius: 0.096 };
let aim = 0;
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

// A deliberately lightweight perspective projection for the first physics test.
function project(x, y, z) {
  const { width, height } = size();
  const depth = (z - court.nearZ) / (court.farZ - court.nearZ);
  const scale = 1.48 - depth * 0.9;
  return {
    // A wider field of view keeps both physical side walls inside a portrait screen.
    x: width / 2 + x * width * 0.04 * scale,
    y: height * (0.79 - depth * 0.48) - y * height * 0.075 * scale,
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
  ctx.fillStyle = "#020403";
  ctx.fillRect(0, 0, width, height);

  const nearLeft = project(-court.halfWidth, 0, court.nearZ);
  const nearRight = project(court.halfWidth, 0, court.nearZ);
  const farLeft = project(-court.halfWidth, 0, court.farZ);
  const farRight = project(court.halfWidth, 0, court.farZ);
  const frontTopLeft = project(-court.halfWidth, court.ceiling, court.farZ);
  const frontTopRight = project(court.halfWidth, court.ceiling, court.farZ);
  const leftTopNear = project(-court.halfWidth, court.ceiling, court.nearZ);
  const rightTopNear = project(court.halfWidth, court.ceiling, court.nearZ);

  polygon([nearLeft, nearRight, farRight, farLeft], "#205a25", "#76a65b", 1);
  // Solid, separate scoring bands make the physical side walls obvious on a phone screen.
  const leftMiddleNear = project(-court.halfWidth, 4, court.nearZ);
  const leftMiddleFar = project(-court.halfWidth, 4, court.farZ);
  const rightMiddleNear = project(court.halfWidth, 4, court.nearZ);
  const rightMiddleFar = project(court.halfWidth, 4, court.farZ);
  polygon([nearLeft, farLeft, leftMiddleFar, leftMiddleNear], "#0b2853", "#59a0ff", 2.5);
  polygon([leftMiddleNear, leftMiddleFar, frontTopLeft, leftTopNear], "#1c5ca9", "#83b9ff", 2.5);
  polygon([nearRight, rightMiddleNear, rightMiddleFar, farRight], "#54200b", "#ffad58", 2.5);
  polygon([rightMiddleNear, rightTopNear, frontTopRight, rightMiddleFar], "#a84713", "#ffd09c", 2.5);
  polygon([farLeft, farRight, frontTopRight, frontTopLeft], "#151618", "#d9b937", 2);

  // Visible horizontal dividers distinguish the 1 and 2 scoring zones on each side wall.
  drawLine(leftMiddleNear, leftMiddleFar, "#dceaff", 2.4);
  drawLine(rightMiddleNear, rightMiddleFar, "#ffe0bd", 2.4);

  // Pitch and creases.
  const pitchNearLeft = project(-1.6, 0.02, -7.2);
  const pitchNearRight = project(1.6, 0.02, -7.2);
  const pitchFarRight = project(1.6, 0.02, 12.2);
  const pitchFarLeft = project(-1.6, 0.02, 12.2);
  polygon([pitchNearLeft, pitchNearRight, pitchFarRight, pitchFarLeft], "rgba(126, 160, 91, 0.34)");
  drawLine(project(-2.2, 0.03, -7.2), project(2.2, 0.03, -7.2), "#f6f6e8", 2);
  drawLine(project(-2.2, 0.03, 12.2), project(2.2, 0.03, 12.2), "#f6f6e8", 1.5);

  drawWicket(-7.5, 1.18);
  drawWicket(12.2, 1.18);

  drawWallLabel("6", 0, 6.0, court.farZ, "#f2c947", 30);
  drawWallLabel("4", 0, 2.1, court.farZ, "#f2c947", 30);
  drawWallLabel("2", -court.halfWidth, 6.0, 5.3, "#4b84ff", 23);
  drawWallLabel("1", -court.halfWidth, 2.1, 5.3, "#4b84ff", 23);
  drawWallLabel("2", court.halfWidth, 6.0, 5.3, "#ff9246", 23);
  drawWallLabel("1", court.halfWidth, 2.1, 5.3, "#ff9246", 23);

  const laneX = size().width / 2 + aim * size().width * 0.25;
  ctx.strokeStyle = "rgba(242, 201, 71, 0.9)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 6]);
  ctx.beginPath(); ctx.moveTo(size().width / 2, size().height * 0.9); ctx.lineTo(laneX, size().height * 0.6); ctx.stroke();
  ctx.setLineDash([]);
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
  ball.x = 0; ball.y = 1.25; ball.z = -7.5;
  ball.vx = aim * 10.5;
  ball.vy = 5.9;
  ball.vz = 20.5;
  inPlay = true;
  scoredThisBall = false;
  resetTime = performance.now() + 6200;
  launchButton.disabled = true;
  statusElement.textContent = "Ball in play…";
}

function resetBall(message) {
  ball.x = 0; ball.y = 1.25; ball.z = -7.5;
  ball.vx = ball.vy = ball.vz = 0;
  inPlay = false;
  launchButton.disabled = false;
  statusElement.textContent = message;
}

function setAim(event) {
  if (inPlay) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = (event.clientX - rect.left) / rect.width;
  aim = Math.max(-0.86, Math.min(0.86, (ratio - 0.5) * 2));
  statusElement.textContent = aim < -0.25 ? "Off-side lane selected." : aim > 0.25 ? "Leg-side lane selected." : "Straight lane selected.";
}

function frame(now) {
  const dt = Math.min(0.033, (now - lastFrame) / 1000);
  lastFrame = now;
  update(dt);
  drawCourt();
  drawBall();
  requestAnimationFrame(frame);
}

canvas.addEventListener("pointerdown", setAim);
launchButton.addEventListener("click", launchBall);
window.addEventListener("resize", resizeCanvas);
resizeCanvas();
resetBall("Tap a lane in the court, then launch the ball.");
requestAnimationFrame(frame);
