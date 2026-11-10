"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const loftButton = document.getElementById("loft");
const timingMarker = document.getElementById("timing-marker");
const scoreElement = document.getElementById("score");
const oversElement = document.getElementById("overs");
const targetElement = document.getElementById("target");
const runsRequiredElement = document.getElementById("runs-required");
const lastBallElement = document.getElementById("last-ball");
const activeBatterElement = document.getElementById("active-batter");
const shotHintElement = document.getElementById("shot-hint");
const statusElement = document.getElementById("status");
const matchResultElement = document.getElementById("match-result");
const resultKickerElement = document.getElementById("result-kicker");
const resultTitleElement = document.getElementById("result-title");
const resultCopyElement = document.getElementById("result-copy");
const playAgainButton = document.getElementById("play-again");
// Freeze Lohit on one correct, compact ready stance before introducing any further
// movement. A bat swing will be re-added only after this pose is approved in-game.
const lohitStanceSprite = new Image();
let lohitStanceReady = false;
lohitStanceSprite.onload = () => {
  lohitStanceReady = true;
  canvas.classList.remove("is-loading");
};
lohitStanceSprite.src = "lohit-batter-stance-v3.png";

// Frame 1 is always the approved standing pose above. The other three sprites form one
// deliberately slow, grounded straight drive: small backlift → contact → high finish.
const lohitDriveMotionSprites = [
  "lohit-drive-load-v3.png",
  "lohit-drive-contact-v3.png",
  "lohit-drive-followthrough-v3.png"
].map((src) => {
  const image = new Image();
  image.src = src;
  return image;
});

// The batting order is deliberately data-driven: later we can change player order,
// artwork, or player-specific abilities here without touching the match rules.
function loadBatterSprite(src) {
  const image = new Image();
  image.src = src;
  return image;
}

function createBatter({ id, name, stance, motion, profile }) {
  return {
    id,
    name,
    profile,
    stance: loadBatterSprite(stance),
    motion: motion.map(loadBatterSprite)
  };
}

const batters = [
  {
    id: "lohit",
    name: "Lohit",
    profile: "approved base player",
    stance: lohitStanceSprite,
    motion: lohitDriveMotionSprites
  },
  createBatter({
    id: "samrat",
    name: "Samrat",
    profile: "102% height, lean build",
    stance: "samrat-batter-stance-v1.png",
    motion: ["samrat-batter-load-v1.png", "samrat-batter-contact-v1.png", "samrat-batter-followthrough-v1.png"]
  }),
  createBatter({
    id: "saadiq",
    name: "Saadiq",
    profile: "105% height, sturdier build",
    stance: "saadiq-batter-stance-v1.png",
    motion: ["saadiq-batter-load-v1.png", "saadiq-batter-contact-v1.png", "saadiq-batter-followthrough-v1.png"]
  }),
  createBatter({
    id: "yashpreet",
    name: "Yashpreet",
    profile: "107% height, tall lean build",
    stance: "yashpreet-batter-stance-v1.png",
    motion: ["yashpreet-batter-load-v1.png", "yashpreet-batter-contact-v1.png", "yashpreet-batter-followthrough-v1.png"]
  })
];

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

// Transparent V2 action poses replace the old effect of merely translating a fixed
// fielder cutout. Each pose is optional at load time and falls back to the ready sprite.
function loadTransparentSprite(src) {
  const image = new Image();
  image.src = src;
  return image;
}

const fielderShuffleSprite = loadTransparentSprite("fielder-yellow-shuffle-v2.png");
const fielderStopSprite = loadTransparentSprite("fielder-yellow-stop-v2.png");
const fielderCatchSprite = loadTransparentSprite("fielder-yellow-catch-v2.png");
const bowlerStopSprite = loadTransparentSprite("bowler-yellow-stop-v2.png");
const bowlerCatchSprite = loadTransparentSprite("bowler-yellow-catch-v2.png");

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
// A fielder may leave his marked position by at most 5% of the court's full width.
// In this arena that is roughly two world units: visible movement, but never a dive
// or an unrealistic run across half the court.
const fielderMoveLimit = court.halfWidth * 2 * 0.05;
const fielderMoveSpeed = 5.7;
const fielderAcceleration = 18;
const fielderDeceleration = 24;
// These same world coordinates drive both the drawn fielders and their deterministic
// interception zones, so the ball can only be caught or stopped where a player is visible.
const fielders = [
  { id: "left-front", label: "Left front-wall fielder", x: -11.2, z: 17.8, homeX: -11.2, homeZ: 17.8, height: 118, mirror: false, pose: "deep", radius: 1.32, catchMinHeight: 1.5, catchMaxHeight: 6.9, action: "ready", speed: 0 },
  { id: "right-front", label: "Right front-wall fielder", x: 11.2, z: 17.8, homeX: 11.2, homeZ: 17.8, height: 118, mirror: true, pose: "deep", radius: 1.32, catchMinHeight: 1.5, catchMaxHeight: 6.9, action: "ready", speed: 0 },
  { id: "leg-side", label: "Leg-side wall fielder", x: -9.8, z: 3.2, homeX: -9.8, homeZ: 3.2, height: 78, mirror: false, pose: "side", radius: 1.18, catchMinHeight: 1.05, catchMaxHeight: 3.25, action: "ready", speed: 0 },
  { id: "off-side", label: "Off-side wall fielder", x: 9.8, z: 3.2, homeX: 9.8, homeZ: 3.2, height: 78, mirror: true, pose: "side", radius: 1.18, catchMinHeight: 1.05, catchMaxHeight: 3.25, action: "ready", speed: 0 }
];
// Once he has released the underarm delivery, the bowler becomes the fifth active fielder.
const bowlerFielder = {
  id: "bowler",
  label: "Bowler",
  x: 2.05,
  z: bowlingPoppingCreaseZ,
  homeX: 2.05,
  homeZ: bowlingPoppingCreaseZ,
  height: 76,
  mirror: false,
  pose: "bowler",
  radius: 1.08,
  catchMinHeight: 1.05,
  catchMaxHeight: 3.55,
  action: "ready",
  speed: 0
};
const fieldingActors = [...fielders, bowlerFielder];
// Ball is reduced again for the compact underarm court, both visually and physically.
const ball = { x: 0, y: 1.25, z: battingStumpsZ, vx: 0, vy: 0, vz: 0, radius: 0.0672 };
const delivery = { phase: "held", nextAt: 0, windupAt: 0, releasedAt: 0, bounced: false };
const deliveryDelayMs = 2200;
const deliveryWindupMs = 750;
const matchConfig = { target: 40, totalBalls: 24, maxWickets: batters.length };
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
let ballsBowled = 0;
let activeBatterIndex = 0;
let batterChange = null;
let matchState = "playing";
let pendingBallResult = null;
let inPlay = false;
let scoredThisBall = false;
let shotWasLofted = false;
let shotHasBounced = false;
let shotHasTouchedRoof = false;
let shotHasTouchedRearWall = false;
let fieldingPlay = null;
let resetTime = 0;
let lastFrame = performance.now();
// The backlift begins with the player's finger movement; impact begins on release.
// Keeping those two moments separate prevents the visual swing from trailing the ball.
const driveAnimation = { phase: "idle", startedAt: 0 };

function isMatchActive() {
  return matchState === "playing";
}

function formatOvers(ballCount) {
  return `${Math.floor(ballCount / 6)}.${ballCount % 6}`;
}

function activeBatter() {
  return batters[activeBatterIndex];
}

function isLoaded(image) {
  return Boolean(image?.complete && image.naturalWidth);
}

function isBatterReady(batter = activeBatter()) {
  return Boolean(batter && isLoaded(batter.stance) && batter.motion.every(isLoaded));
}

function updateHud() {
  scoreElement.textContent = `${score} / ${wickets}`;
  oversElement.textContent = `${formatOvers(ballsBowled)} / 4`;
  targetElement.textContent = String(matchConfig.target);
  activeBatterElement.textContent = activeBatter().name;
  shotHintElement.textContent = `Choose Loft before the release. Watch the underarm delivery, then swipe forward from straight to 70° left or right before the ball reaches ${activeBatter().name}'s stumps.`;
  const runsRequired = Math.max(0, matchConfig.target - score);
  runsRequiredElement.textContent = runsRequired === 0
    ? "Target reached"
    : `${runsRequired} run${runsRequired === 1 ? "" : "s"} to win`;
}

function setLastBall(text) {
  lastBallElement.textContent = `Previous ball: ${text}`;
}

function queueBallResult({ runs = 0, wicket = false, label, status, dismissal = null, fielderLabel = null }) {
  // Only the first scoring event may decide the result of a ball. The score itself is
  // deliberately held back until play has ended and the ball is officially dead.
  if (pendingBallResult) return;
  pendingBallResult = { runs, wicket, label, status, dismissal, fielderLabel };
  scoredThisBall = runs > 0;
  if (status) statusElement.textContent = status;
}

function finishCurrentBall(delayMs = 500) {
  if (!isMatchActive() || delivery.phase === "dead" || delivery.phase === "complete") return;
  if (!pendingBallResult) {
    queueBallResult({ label: "Dot ball", status: "Dot ball — no score." });
  }
  delivery.phase = "dead";
  inPlay = false;
  timingRunning = false;
  resetTime = performance.now() + delayMs;
}

function completeBall() {
  if (!isMatchActive()) return;
  const result = pendingBallResult || { runs: 0, wicket: false, label: "Dot ball" };
  score += result.runs;
  wickets += result.wicket ? 1 : 0;
  ballsBowled += 1;
  pendingBallResult = null;
  updateHud();
  setLastBall(result.label);

  if (score >= matchConfig.target) {
    endMatch("win");
    return;
  }
  if (wickets >= matchConfig.maxWickets) {
    endMatch("wicket", result);
    return;
  }
  if (ballsBowled >= matchConfig.totalBalls) {
    endMatch("overs");
    return;
  }
  if (result.wicket) {
    beginNextBatterTransition(result);
    return;
  }

  resetBall(`Ball ${ballsBowled + 1} of ${matchConfig.totalBalls} — choose Loft if you want a lofted shot.`);
}

function beginNextBatterTransition(result) {
  const dismissed = activeBatter();
  const nextBatterIndex = activeBatterIndex + 1;
  const nextBatter = batters[nextBatterIndex];
  if (!nextBatter) {
    endMatch("wicket", result);
    return;
  }

  const dismissal = result.dismissal === "caught"
    ? `${dismissed.name} caught by ${result.fielderLabel}`
    : `${dismissed.name} bowled`;
  batterChange = {
    startedAt: performance.now(),
    nextBatterIndex,
    nextBatterName: nextBatter.name,
    switched: false
  };
  delivery.phase = "batterChange";
  inPlay = false;
  timingRunning = false;
  swipeStart = null;
  driveAnimation.phase = "idle";
  loftButton.disabled = true;
  statusElement.textContent = `${dismissal} — ${nextBatter.name} is coming in.`;
}

function updateBatterChange() {
  if (!batterChange) return;
  const elapsed = performance.now() - batterChange.startedAt;
  if (!batterChange.switched && elapsed >= 360) {
    activeBatterIndex = batterChange.nextBatterIndex;
    batterChange.switched = true;
    updateHud();
  }
  if (batterChange.switched && elapsed >= 920) {
    if (!isBatterReady()) {
      statusElement.textContent = `${batterChange.nextBatterName} is taking guard…`;
      return;
    }
    const incomingName = activeBatter().name;
    batterChange = null;
    resetBall(`${incomingName} is now batting — Ball ${ballsBowled + 1} of ${matchConfig.totalBalls}.`);
  }
}

function endMatch(reason, result = null) {
  matchState = "complete";
  delivery.phase = "complete";
  inPlay = false;
  timingRunning = false;
  swipeStart = null;
  loftButton.disabled = true;

  const runsShort = Math.max(0, matchConfig.target - score);
  if (reason === "win") {
    resultKickerElement.textContent = "Target chased";
    resultTitleElement.textContent = "You win!";
    resultCopyElement.textContent = `${score} / ${wickets} in ${formatOvers(ballsBowled)} overs — ${activeBatter().name} reaches ${matchConfig.target}.`;
    statusElement.textContent = "Target reached — match won!";
  } else if (reason === "wicket") {
    resultKickerElement.textContent = "Wicket down";
    const caught = result?.dismissal === "caught";
    resultTitleElement.textContent = caught ? "Caught!" : "All out";
    resultCopyElement.textContent = `${score} / ${wickets} in ${formatOvers(ballsBowled)} overs. You needed ${runsShort} more run${runsShort === 1 ? "" : "s"}.`;
    statusElement.textContent = caught
      ? `Caught by ${result.fielderLabel} — the match is over.`
      : "Bowled — the match is over.";
  } else {
    resultKickerElement.textContent = "Four overs complete";
    resultTitleElement.textContent = "Target missed";
    resultCopyElement.textContent = `${score} / ${wickets} after 4 overs. You needed ${runsShort} more run${runsShort === 1 ? "" : "s"}.`;
    statusElement.textContent = "Innings complete.";
  }

  matchResultElement.hidden = false;
  matchResultElement.setAttribute("aria-hidden", "false");
}

function startNewMatch() {
  score = 0;
  wickets = 0;
  ballsBowled = 0;
  activeBatterIndex = 0;
  batterChange = null;
  matchState = "playing";
  pendingBallResult = null;
  scoredThisBall = false;
  shotAngle = defaultShotAngle;
  loftSelected = false;
  loftButton.classList.remove("is-selected");
  loftButton.setAttribute("aria-pressed", "false");
  loftButton.textContent = "Loft: Off";
  matchResultElement.hidden = true;
  matchResultElement.setAttribute("aria-hidden", "true");
  resetFielderPositions();
  updateHud();
  setLastBall("—");
  resetBall("Ball 1 of 24 — choose Loft if you want a lofted shot.");
}

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
  // Keep the arena clean while a player frame loads—never substitute Lohit's or an old
  // 2D image for the incoming batter.
  if (!batterChange && isBatterReady()) drawShotGuide();
  drawBatter();
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
  // Black round dots make the aim guide distinct from the yellow bowler and fielders.
  ctx.strokeStyle = "rgba(0, 0, 0, 0.92)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.setLineDash([1, 8]);
  ctx.beginPath(); ctx.moveTo(layout.batContact.x, layout.batContact.y); ctx.lineTo(endX, endY); ctx.stroke();
  ctx.restore();
}

function drawBatter() {
  if (!isBatterReady()) return;
  const { spriteX, spriteY, spriteWidth, spriteHeight } = batterLayout();
  const sprite = getDriveSprite();
  if (!sprite) return;
  const changeElapsed = batterChange ? performance.now() - batterChange.startedAt : null;
  let opacity = 1;
  if (batterChange && !batterChange.switched) opacity = Math.max(0, 1 - changeElapsed / 280);
  if (batterChange?.switched) opacity = Math.min(1, Math.max(0, (changeElapsed - 360) / 260));
  if (opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(sprite, spriteX, spriteY, spriteWidth, spriteHeight);
  ctx.restore();
}

function getDriveSprite(now = performance.now()) {
  const batter = activeBatter();
  if (!isBatterReady(batter)) return null;
  if (driveAnimation.phase === "idle") return batter.stance;
  if (driveAnimation.phase === "backlift") return getMotionSprite(batter, 0);

  const elapsed = now - driveAnimation.startedAt;
  if (elapsed < 145) return getMotionSprite(batter, 1); // impact happens as the ball launches
  if (elapsed < 455) return getMotionSprite(batter, 2); // controlled follow-through after impact

  driveAnimation.phase = "idle";
  return batter.stance;
}

function getMotionSprite(batter, index) {
  const motionSprite = batter.motion[index];
  // Never replace a player with Lohit or an old pose on a slow phone connection.
  if (!isLoaded(motionSprite)) return null;
  return motionSprite;
}

function drawBowler() {
  if (!bowlerSpriteReady) return;
  // After delivery, the bowler is the fifth fielding actor. Draw his action pose from
  // the same world coordinate used by the interception logic rather than leaving him frozen.
  if (["shot", "fielderCaught", "fielderStopped", "dead"].includes(delivery.phase)) {
    drawFielder(bowlerFielder, getBowlerFieldSprite());
    return;
  }
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
  fielders.forEach((fielder) => drawFielder(fielder, getFielderSprite(fielder)));
}

function spriteIsReady(sprite) {
  return sprite && sprite.complete && sprite.naturalWidth > 0;
}

function getFielderSprite(fielder) {
  if (fielder.action === "shuffle" && spriteIsReady(fielderShuffleSprite)) return fielderShuffleSprite;
  if (fielder.action === "stop" && spriteIsReady(fielderStopSprite)) return fielderStopSprite;
  if (fielder.action === "catch" && spriteIsReady(fielderCatchSprite)) return fielderCatchSprite;
  if (fielder.pose === "side" && inwardFielderSpriteReady) return inwardFielderSpriteClean || inwardFielderSprite;
  return fielderSpriteClean || fielderSprite;
}

function getBowlerFieldSprite() {
  if (bowlerFielder.action === "stop" && spriteIsReady(bowlerStopSprite)) return bowlerStopSprite;
  if (bowlerFielder.action === "catch" && spriteIsReady(bowlerCatchSprite)) return bowlerCatchSprite;
  if (bowlerFielder.action === "shuffle" && spriteIsReady(fielderShuffleSprite)) return fielderShuffleSprite;
  return bowlerReleaseSpriteClean || bowlerReleaseSprite || bowlerSpriteClean || bowlerSprite;
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
  if (["held", "windup", "dead", "batterChange", "complete"].includes(delivery.phase)) return;
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

function updateFielders(dt) {
  // On a settled catch or stop, keep the successful player at the ball so the outcome
  // remains visually readable. In all other phases, players recover to their marks.
  if (delivery.phase === "fielderCaught" || delivery.phase === "fielderStopped") return;
  if (scoredThisBall || pendingBallResult) {
    fieldingPlay = null;
    fieldingActors.forEach((actor) => {
      actor.action = "ready";
      actor.speed = 0;
    });
  }

  fieldingActors.forEach((actor) => {
    const selected = fieldingPlay?.actor === actor;
    const target = selected ? fieldingPlay.target : { x: actor.homeX, z: actor.homeZ };
    moveFieldingActor(actor, target, dt);

    if (!selected) return;
    const closeToBall = Math.hypot(ball.x - actor.x, ball.z - actor.z) <= actor.radius + 0.72;
    actor.action = closeToBall
      ? fieldingPlay.kind === "catch" ? "catch" : "stop"
      : "shuffle";
  });
}

function moveFieldingActor(actor, target, dt) {
  const dx = target.x - actor.x;
  const dz = target.z - actor.z;
  const distance = Math.hypot(dx, dz);
  const brakingDistance = actor.speed * actor.speed / (2 * fielderDeceleration);
  const targetSpeed = distance <= brakingDistance + 0.04 ? 0 : fielderMoveSpeed;
  const rate = targetSpeed > actor.speed ? fielderAcceleration : fielderDeceleration;
  actor.speed = Math.max(0, Math.min(fielderMoveSpeed, actor.speed + Math.sign(targetSpeed - actor.speed) * rate * dt));
  const step = Math.min(distance, actor.speed * dt);
  if (distance > 0.001 && step > 0) {
    actor.x += dx / distance * step;
    actor.z += dz / distance * step;
  }
  if (distance <= 0.04) actor.speed = 0;
  if (actor.action !== "catch" && actor.action !== "stop") actor.action = distance > 0.08 ? "shuffle" : "ready";
}

function predictFieldingPlay() {
  const simulation = {
    x: ball.x,
    y: ball.y,
    z: ball.z,
    vx: ball.vx,
    vy: ball.vy,
    vz: ball.vz,
    bounced: false,
    touchedRoof: false
  };
  const sampleStep = 0.04;
  for (let elapsed = sampleStep; elapsed <= 2.4; elapsed += sampleStep) {
    simulation.vy -= 9.8 * sampleStep;
    simulation.x += simulation.vx * sampleStep;
    simulation.y += simulation.vy * sampleStep;
    simulation.z += simulation.vz * sampleStep;
    if (simulation.y <= ball.radius) {
      simulation.y = ball.radius;
      simulation.vy = Math.abs(simulation.vy) * 0.61;
      simulation.vx *= 0.9;
      simulation.vz *= 0.9;
      simulation.bounced = true;
    }
    if (simulation.y >= court.ceiling - ball.radius) {
      simulation.y = court.ceiling - ball.radius;
      simulation.vy = -Math.abs(simulation.vy) * 0.72;
      simulation.touchedRoof = true;
    }
    // A scoring wall ends the prediction: fielders may not claim a ball after score first.
    if (Math.abs(simulation.x) >= court.halfWidth - ball.radius || simulation.z >= court.farZ - ball.radius || simulation.z <= court.nearZ + ball.radius) {
      break;
    }

    const candidate = fieldingActors
      .map((actor) => {
        const distanceFromHome = Math.hypot(simulation.x - actor.homeX, simulation.z - actor.homeZ);
        const moveNeeded = Math.max(0, distanceFromHome - actor.radius);
        const canReach = moveNeeded <= fielderMoveLimit && estimateFielderMoveTime(moveNeeded) <= elapsed;
        const canCatch = !simulation.bounced
          && !simulation.touchedRoof
          && simulation.y >= actor.catchMinHeight
          && simulation.y <= actor.catchMaxHeight;
        const canStop = simulation.bounced || simulation.y <= actor.catchMinHeight;
        const kind = canCatch ? "catch" : canStop ? "stop" : null;
        return canReach && kind ? { actor, kind, time: elapsed, x: simulation.x, z: simulation.z, y: simulation.y, distanceFromHome } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceFromHome - b.distanceFromHome)[0];

    if (candidate) {
      const target = getReachableFieldingTarget(candidate.actor, candidate.x, candidate.z);
      console.debug(`[Fielding V2] ${candidate.actor.label} selected for ${candidate.kind} at ${candidate.time.toFixed(2)}s.`);
      return { ...candidate, target };
    }
  }
  console.debug("[Fielding V2] No reachable player selected; ball continues to the wall.");
  return null;
}

function estimateFielderMoveTime(distance) {
  const accelerationDistance = fielderMoveSpeed * fielderMoveSpeed / (2 * fielderAcceleration);
  if (distance <= accelerationDistance) return Math.sqrt(2 * distance / fielderAcceleration);
  return fielderMoveSpeed / fielderAcceleration + (distance - accelerationDistance) / fielderMoveSpeed;
}

function getReachableFieldingTarget(actor, ballX, ballZ) {
  const dx = ballX - actor.homeX;
  const dz = ballZ - actor.homeZ;
  const distance = Math.hypot(dx, dz) || 1;
  const travel = Math.min(fielderMoveLimit, distance);
  return {
    x: actor.homeX + dx / distance * travel,
    z: actor.homeZ + dz / distance * travel
  };
}

function resetFielderPositions() {
  fieldingActors.forEach((actor) => {
    actor.x = actor.homeX;
    actor.z = actor.homeZ;
    actor.speed = 0;
    actor.action = "ready";
  });
  fieldingPlay = null;
}

function update(dt) {
  if (!isMatchActive()) return;
  updateFielders(dt);
  if (delivery.phase === "batterChange") {
    updateBatterChange();
    return;
  }
  if (delivery.phase === "fielderCaught" || delivery.phase === "fielderStopped") {
    updateFielderResolution();
    return;
  }
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
  if (!isMatchActive()) return;
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
  return isMatchActive()
    && delivery.phase === "incoming"
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
    if (now >= resetTime) completeBall();
    return;
  }

  if (delivery.phase === "wicketHit") {
    // Keep the ball visibly resting against the wicket for a moment before the reset.
    if (now >= delivery.resultAt + 760) {
      finishCurrentBall(520);
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
    queueBallResult({
      wicket: true,
      dismissal: "bowled",
      label: "Wicket — bowled",
      status: `Bowled! ${activeBatter().name}'s stumps are dismantled.`
    });
    return;
  }

  if (ball.z < battingStumpsZ - 1.35) {
    queueBallResult({ label: "Dot ball", status: "Ball passed Lohit outside the stumps — dot ball." });
    finishCurrentBall(500);
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
    shotHasBounced = true;
  }
  if (ball.y + ball.radius >= court.ceiling) {
    ball.y = court.ceiling - ball.radius;
    ball.vy = -Math.abs(ball.vy) * 0.72;
    // Roof-rebound catches are intentionally excluded from this version. A roof touch can still
    // lead to a later ground stop after the ball comes down.
    shotHasTouchedRoof = true;
  }

  // Fielders are tested before the scoring walls. This makes their visual positions
  // authoritative: a ball can only be stopped or caught by a player it visibly reaches.
  if (resolveFielderInteraction()) {
    return;
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
    // Rear-wall rebound catches are deliberately deferred beyond this version.
    shotHasTouchedRearWall = true;
  }
  if (performance.now() >= resetTime || ball.z < court.nearZ + 0.2) finishCurrentBall(450);
}

function resolveFielderInteraction() {
  // A scoring wall always wins if it was reached first, and only the player selected
  // from the predicted path is allowed to resolve this ball.
  if (scoredThisBall || pendingBallResult) return false;
  const fielder = fieldingPlay?.actor;
  if (!fielder) return false;
  const distance = Math.hypot(ball.x - fielder.x, ball.z - fielder.z);
  if (distance > fielder.radius) return false;

  const canCatch = !shotHasBounced
    && !shotHasTouchedRoof
    && !shotHasTouchedRearWall
    && ball.y >= fielder.catchMinHeight
    && ball.y <= fielder.catchMaxHeight;

  if (canCatch) {
    // Preserve the actual meeting point instead of snapping the ball to a distant sprite.
    // The selected catcher is already in a hands-up action pose at this close distance.
    fielder.action = "catch";
    ball.vx = ball.vy = ball.vz = 0;
    delivery.phase = "fielderCaught";
    delivery.resultAt = performance.now();
    queueBallResult({
      wicket: true,
      dismissal: "caught",
      fielderLabel: fielder.label,
      label: `Wicket — caught by ${fielder.label}`,
      status: `${activeBatter().name} caught by ${fielder.label}!`
    });
    return true;
  }

  const canStop = shotHasBounced || ball.y <= fielder.catchMinHeight;
  if (!canStop) return false;

  // A stopped ball is placed at the selected player's feet only after the player has
  // reached the same small interaction zone as the actual moving ball.
  fielder.action = "stop";
  ball.x = fielder.x;
  ball.y = ball.radius;
  ball.z = fielder.z;
  ball.vx = ball.vy = ball.vz = 0;
  delivery.phase = "fielderStopped";
  delivery.resultAt = performance.now();
  queueBallResult({
    label: `Dot ball — stopped by ${fielder.label}`,
    status: `Stopped by ${fielder.label} — dot ball.`
  });
  return true;
}

function updateFielderResolution() {
  // Leave the ball visibly at the fielder for a short beat. The official ball result
  // is still applied only after this display period, via completeBall().
  if (performance.now() >= delivery.resultAt + 700) finishCurrentBall(420);
}

function scoreRuns(runs) {
  queueBallResult({
    runs,
    label: `${runs} run${runs === 1 ? "" : "s"}`,
    status: `${runs} run${runs === 1 ? "" : "s"}! First scoring-wall contact is locked.`
  });
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
  // The player has already lifted the bat during the swipe. At release, show impact
  // immediately—on the same frame that the ball leaves Lohit's contact area.
  driveAnimation.phase = "contact";
  driveAnimation.startedAt = performance.now();
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
  // Pick one reachable defender from the projected path before the ball starts moving.
  // This avoids every fielder reacting late to the same live ball.
  fieldingPlay = predictFieldingPlay();
  delivery.phase = "shot";
  inPlay = true;
  scoredThisBall = false;
  shotWasLofted = loftSelected;
  shotHasBounced = false;
  shotHasTouchedRoof = false;
  shotHasTouchedRearWall = false;
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
  if (!isMatchActive()) return;
  delivery.phase = "held";
  delivery.nextAt = performance.now() + deliveryDelayMs;
  delivery.bounced = false;
  placeBallInBowlerHand();
  inPlay = false;
  scoredThisBall = false;
  shotWasLofted = false;
  shotHasBounced = false;
  shotHasTouchedRoof = false;
  shotHasTouchedRearWall = false;
  fieldingPlay = null;
  fieldingActors.forEach((actor) => {
    actor.action = "ready";
    actor.speed = 0;
  });
  driveAnimation.phase = "idle";
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
  if (!isMatchActive()) return;
  if (!isBallPlayable()) {
    if (!inPlay) statusElement.textContent = "Wait for the underarm ball to reach Lohit.";
    return;
  }
  const rect = canvas.getBoundingClientRect();
  swipeStart = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  // A compact raised-bat pose starts as the player begins the forward gesture.
  driveAnimation.phase = "backlift";
  driveAnimation.startedAt = performance.now();
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
  if (!swipeStart) return;
  if (!isBallPlayable()) {
    swipeStart = null;
    driveAnimation.phase = "idle";
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const dx = event.clientX - rect.left - swipeStart.x;
  const forward = swipeStart.y - (event.clientY - rect.top);
  swipeStart = null;
  if (forward < 34) {
    driveAnimation.phase = "idle";
    statusElement.textContent = "Swipe forward to play a shot.";
    return;
  }
  shotAngle = clampShotAngle(Math.atan2(dx, forward));
  launchBall(shotAngle);
}

function toggleLoft() {
  if (!isMatchActive() || inPlay) return;
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
  driveAnimation.phase = "idle";
  if (isBallPlayable()) statusElement.textContent = "Swipe forward in the court to play a shot.";
});
loftButton.addEventListener("click", toggleLoft);
playAgainButton.addEventListener("click", startNewMatch);
window.addEventListener("resize", resizeCanvas);
resizeCanvas();
startNewMatch();
requestAnimationFrame(frame);
