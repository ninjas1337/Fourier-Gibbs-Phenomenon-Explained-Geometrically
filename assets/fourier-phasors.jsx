import { useState, useRef, useEffect, useCallback } from "react";

const COLORS = {
  bg: "#0a0a0f",
  gold: "#e8c547",
  blue: "#4a9eff",
  red: "#ff4466",
  green: "#44cc88",
  axis: "#333344",
  axisLabel: "#667788",
  text: "#c8c8d4",
  dim: "#556677",
  grid: "#151525",
  phasorGhost: "rgba(232,197,71,0.12)",
  waveform: "#4a9eff",
  overshoot: "#ff4466",
  pts: "#44cc88",
  plateau: "rgba(68,204,136,0.3)",
  velocity: "#ff8844",
};

export default function FourierPhasors() {
  const phasorCanvasRef = useRef(null);
  const waveCanvasRef = useRef(null);
  const ptsCanvasRef = useRef(null);
  const [numHarmonics, setNumHarmonics] = useState(5);
  const [speed, setSpeed] = useState(1.0);
  const [playing, setPlaying] = useState(true);
  const [showTrail, setShowTrail] = useState(true);
  const [showPTSLine, setShowPTSLine] = useState(true);
  const [showVelocity, setShowVelocity] = useState(true);
  const [showArmVectors, setShowArmVectors] = useState(false);
  const [highlightArm, setHighlightArm] = useState(0);
  const [manualPos, setManualPos] = useState(0); // 0 to 360 degrees
  const timeRef = useRef(0);
  const animRef = useRef(null);
  const trailRef = useRef([]);
  const playingRef = useRef(playing);
  const lastFrameRef = useRef(performance.now());

  playingRef.current = playing;

  const J = 2.0;
  const ptsTarget = J / Math.PI;

  const getCoeff = useCallback((n) => {
    const k = 2 * n - 1;
    return { k, amp: (4 / (k * Math.PI)) * 0.5 };
  }, []);

  const drawPhasors = useCallback(() => {
    const canvas = phasorCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    const cx = W * 0.5;
    const cy = H * 0.48;
    const scale = Math.min(W, H) * 0.30;
    const t = timeRef.current;
    const velScale = scale * 0.35;

    // Ghost circles
    if (showTrail) {
      let gx = cx, gy = cy;
      for (let i = 1; i <= numHarmonics; i++) {
        const { k, amp } = getCoeff(i);
        const r = amp * scale;
        const isHL = highlightArm === 0 || highlightArm === i;
        ctx.strokeStyle = isHL ? COLORS.phasorGhost : "rgba(232,197,71,0.04)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(gx, gy, r, 0, 2 * Math.PI);
        ctx.stroke();
        gx += r * Math.cos(k * t);
        gy -= r * Math.sin(k * t);
      }
    }

    // Collect arm data
    const arms = [];
    let px = cx, py = cy;
    for (let i = 1; i <= numHarmonics; i++) {
      const { k, amp } = getCoeff(i);
      const r = amp * scale;
      const angle = k * t;
      const nx = px + r * Math.cos(angle);
      const ny = py - r * Math.sin(angle);
      const velMag = k * amp;
      const velAngle = angle + Math.PI / 2;
      const vx = velMag * velScale * Math.cos(velAngle);
      const vy = -velMag * velScale * Math.sin(velAngle);
      arms.push({ i, k, amp, r, angle, sx: px, sy: py, ex: nx, ey: ny, vx, vy, velMag });
      px = nx;
      py = ny;
    }

    // Draw arms
    for (const arm of arms) {
      const isHL = highlightArm === 0 || highlightArm === arm.i;
      const alpha = isHL ? 0.4 + 0.6 * (1 - (arm.i - 1) / Math.max(numHarmonics, 1)) : 0.08;
      ctx.strokeStyle = `rgba(232,197,71,${alpha})`;
      ctx.lineWidth = isHL ? Math.max(1.5, 3 - arm.i * 0.12) : 1;
      ctx.beginPath();
      ctx.moveTo(arm.sx, arm.sy);
      ctx.lineTo(arm.ex, arm.ey);
      ctx.stroke();
      ctx.fillStyle = `rgba(232,197,71,${alpha * 0.7})`;
      ctx.beginPath();
      ctx.arc(arm.sx, arm.sy, 2, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Velocity arrows — show resultant tip velocity (sum of all arm contributions)
    if (showVelocity && arms.length > 0) {
      const last = arms[arms.length - 1];
      
      // Compute resultant tip velocity: vector sum of all tangential velocities
      // For arm with harmonic k: dx/dt = -k·A_k·sin(k·t), dy/dt = k·A_k·cos(k·t)
      let totalVx = 0, totalVy = 0;
      const armVelocities = [];
      for (const arm of arms) {
        const { k, amp, angle } = arm;
        const avx = -k * amp * Math.sin(angle);
        const avy = k * amp * Math.cos(angle);
        totalVx += avx;
        totalVy += avy;
        armVelocities.push({ avx, avy, k, amp, velMag: k * amp, i: arm.i });
      }
      
      // Scale for display (map to screen coords: x→right, y→up but canvas y is down)
      const resultantVx = totalVx * velScale;
      const resultantVy = -totalVy * velScale; // flip y for canvas
      const resultantSpeed = Math.sqrt(totalVx * totalVx + totalVy * totalVy);
      
      const tipX = last.ex, tipY = last.ey;
      const arrowEndX = tipX + resultantVx;
      const arrowEndY = tipY + resultantVy;

      // Individual arm velocity vectors — drawn as a chain from the tip
      if (showArmVectors) {
        // Color palette for arm vectors
        const armColors = [
          "#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c",
          "#38d9a9", "#4dabf7", "#748ffc", "#da77f2",
          "#f783ac", "#e8590c", "#94d82d", "#22b8cf",
          "#845ef7", "#ff8787", "#ffc078", "#a9e34b",
          "#66d9e8", "#9775fa", "#f06595", "#fd7e14",
        ];

        // Draw as stacked vectors from tip point (vector addition visualization)
        let chainX = tipX, chainY = tipY;
        for (let vi = 0; vi < armVelocities.length; vi++) {
          const av = armVelocities[vi];
          const isHL = highlightArm === 0 || highlightArm === av.i;
          const svx = av.avx * velScale;
          const svy = -av.avy * velScale;
          const endX = chainX + svx;
          const endY = chainY + svy;
          const color = armColors[vi % armColors.length];
          const alpha = isHL ? 0.85 : 0.15;

          ctx.strokeStyle = isHL ? color : `rgba(128,128,128,${alpha})`;
          ctx.lineWidth = isHL ? 2 : 1;
          ctx.beginPath();
          ctx.moveTo(chainX, chainY);
          ctx.lineTo(endX, endY);
          ctx.stroke();

          // Small arrowhead
          if (isHL) {
            const len = Math.sqrt(svx * svx + svy * svy);
            if (len > 4) {
              const aa = Math.atan2(endY - chainY, endX - chainX);
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.moveTo(endX, endY);
              ctx.lineTo(endX - 6 * Math.cos(aa - 0.4), endY - 6 * Math.sin(aa - 0.4));
              ctx.lineTo(endX - 6 * Math.cos(aa + 0.4), endY - 6 * Math.sin(aa + 0.4));
              ctx.closePath();
              ctx.fill();
            }

            // Label for small N or highlighted arm
            if (numHarmonics <= 10 || highlightArm === av.i) {
              ctx.fillStyle = color;
              ctx.font = "10px 'Courier New', monospace";
              ctx.textAlign = "left";
              ctx.fillText(`k=${av.k}`, endX + 3, endY - 3);
            }
          }

          chainX = endX;
          chainY = endY;
        }
      }
      
      // Resultant velocity arrow (thick, bright orange) — drawn on top
      ctx.strokeStyle = COLORS.velocity;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(arrowEndX, arrowEndY);
      ctx.stroke();
      
      // Arrowhead
      const aAngle = Math.atan2(arrowEndY - tipY, arrowEndX - tipX);
      ctx.fillStyle = COLORS.velocity;
      ctx.beginPath();
      ctx.moveTo(arrowEndX, arrowEndY);
      ctx.lineTo(arrowEndX - 9 * Math.cos(aAngle - 0.35), arrowEndY - 9 * Math.sin(aAngle - 0.35));
      ctx.lineTo(arrowEndX - 9 * Math.cos(aAngle + 0.35), arrowEndY - 9 * Math.sin(aAngle + 0.35));
      ctx.closePath();
      ctx.fill();
      
      // Speed label
      ctx.fillStyle = COLORS.velocity;
      ctx.font = "bold 12px 'Courier New', monospace";
      ctx.textAlign = "left";
      ctx.fillText(`|v| = ${resultantSpeed.toFixed(3)}`, arrowEndX + 6, arrowEndY - 6);
      
      // If a specific arm is highlighted and arm vectors off, show its contribution dashed
      if (highlightArm > 0 && highlightArm <= numHarmonics && !showArmVectors) {
        const ha = arms[highlightArm - 1];
        const hvx = -ha.k * ha.amp * Math.sin(ha.angle) * velScale;
        const hvy = -(ha.k * ha.amp * Math.cos(ha.angle)) * velScale;
        
        ctx.strokeStyle = "rgba(255,136,68,0.4)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX + hvx, tipY + hvy);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = "rgba(255,136,68,0.6)";
        ctx.font = "11px 'Courier New', monospace";
        ctx.fillText(`arm ${highlightArm}: ${ha.velMag.toFixed(3)}`, tipX + hvx + 4, tipY + hvy + 12);
      }
    }

    // Tip dot
    if (arms.length > 0) {
      const last = arms[arms.length - 1];
      ctx.fillStyle = COLORS.gold;
      ctx.shadowColor = COLORS.gold;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(last.ex, last.ey, 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0;
      trailRef.current.push({ x: last.ex, y: last.ey });
      if (trailRef.current.length > 300) trailRef.current.shift();
      if (showTrail && trailRef.current.length > 2) {
        ctx.beginPath();
        for (let i = 0; i < trailRef.current.length; i++) {
          const p = trailRef.current[i];
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = "rgba(232,197,71,0.2)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(232,197,71,0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(last.ex, last.ey);
      ctx.lineTo(W, last.ey);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Overshoot marker on the orbit
    // Find the angle where the Fourier partial sum is maximized (Gibbs peak)
    if (numHarmonics >= 2) {
      let maxSum = -Infinity;
      let overshootTheta = 0;
      // Search near the jump (0 to π) for the peak
      for (let s = 1; s <= 300; s++) {
        const theta = (s / 300) * Math.PI;
        let val = 0;
        for (let h = 1; h <= numHarmonics; h++) {
          const { k, amp } = getCoeff(h);
          val += amp * Math.sin(k * theta) * 2;
        }
        if (val > maxSum) {
          maxSum = val;
          overshootTheta = theta;
        }
      }

      // Trace the phasor chain at overshootTheta to get the 2D position
      let ox = cx, oy = cy;
      for (let h = 1; h <= numHarmonics; h++) {
        const { k, amp } = getCoeff(h);
        const r = amp * scale;
        ox += r * Math.cos(k * overshootTheta);
        oy -= r * Math.sin(k * overshootTheta);
      }

      // Also find the target (no overshoot) position — at the square wave value of 1.0
      // The y-position where the sum equals exactly 1.0 on the phasor plane
      let tx = cx, ty = cy;
      // Find angle where sum ≈ 1.0 (just past the overshoot peak)
      let targetTheta = Math.PI / 2; // midpoint of high section
      for (let h = 1; h <= numHarmonics; h++) {
        const { k, amp } = getCoeff(h);
        const r = amp * scale;
        tx += r * Math.cos(k * targetTheta);
        ty -= r * Math.sin(k * targetTheta);
      }

      // Draw overshoot marker — pulsing red dot
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() * 0.004);
      const overshootPct = ((maxSum - 1.0) * 100).toFixed(1);

      // Line from target-level y to overshoot point (vertical on phasor plane)
      // Show the excess as a red segment on the orbit
      ctx.strokeStyle = `rgba(255,68,102,${0.6 * pulse})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      // Horizontal reference: where y would be if sum = 1.0
      // The phasor y-displacement is proportional to the imaginary sum
      // The overshoot is purely in the vertical (imaginary/y) direction from center
      const refY = cy - (1.0 / 1.0) * (getCoeff(1).amp * scale * numHarmonics * 0.32);
      ctx.moveTo(ox - 20, oy);
      ctx.lineTo(ox + 20, oy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Red glowing dot at the overshoot point
      ctx.fillStyle = COLORS.overshoot;
      ctx.shadowColor = COLORS.overshoot;
      ctx.shadowBlur = 10 * pulse;
      ctx.beginPath();
      ctx.arc(ox, oy, 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Small ring to distinguish from the moving gold dot
      ctx.strokeStyle = COLORS.overshoot;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ox, oy, 10, 0, 2 * Math.PI);
      ctx.stroke();

      // Label
      ctx.fillStyle = COLORS.overshoot;
      ctx.font = "bold 12px 'Courier New', monospace";
      ctx.textAlign = "left";
      ctx.fillText(`Gibbs peak`, ox + 14, oy - 8);
      ctx.fillStyle = COLORS.dim;
      ctx.font = "11px 'Courier New', monospace";
      ctx.fillText(`+${overshootPct}% overshoot`, ox + 14, oy + 6);
      ctx.fillText(`θ ≈ ${(overshootTheta * 180 / Math.PI).toFixed(1)}°`, ox + 14, oy + 20);
    }

    // Center dot
    ctx.fillStyle = COLORS.dim;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
    ctx.fill();

    // Top info
    ctx.fillStyle = COLORS.dim;
    ctx.font = "13px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillText(`Harmonics: ${numHarmonics}`, 12, 20);

    // Decomposition readout
    if (highlightArm > 0 && highlightArm <= numHarmonics) {
      const { k, amp } = getCoeff(highlightArm);
      const pts = k * amp;
      const y0 = H - 80;

      ctx.fillStyle = COLORS.gold;
      ctx.font = "bold 12px 'Courier New', monospace";
      ctx.fillText(`Arm ${highlightArm}:  harmonic k = ${k}`, 12, y0);

      ctx.fillStyle = COLORS.text;
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillText(`Radius   Aₖ = ${amp.toFixed(5)}  (shrinking)`, 12, y0 + 18);
      ctx.fillText(`Spin      ω = ${k}×            (growing)`, 12, y0 + 34);

      ctx.fillStyle = COLORS.velocity;
      ctx.font = "bold 12px 'Courier New', monospace";
      ctx.fillText(`Arm PTS  = ${k} × ${amp.toFixed(5)} = ${pts.toFixed(5)}`, 12, y0 + 54);

      ctx.fillStyle = COLORS.pts;
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillText(`J/π       = ${ptsTarget.toFixed(5)}  (target)`, 12, y0 + 72);
    } else {
      const y0 = H - 42;
      ctx.fillStyle = COLORS.dim;
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillText(`Select an arm below to inspect`, 12, y0);
      if (showVelocity && showArmVectors) {
        ctx.fillStyle = "#da77f2";
        ctx.fillText(`Coloured = each arm's velocity contribution`, 12, y0 + 17);
        ctx.fillStyle = COLORS.velocity;
        ctx.fillText(`Orange = resultant (vector sum)`, 12, y0 + 32);
      } else if (showVelocity) {
        ctx.fillStyle = COLORS.velocity;
        ctx.fillText(`Orange arrow = resultant tip velocity`, 12, y0 + 17);
      }
    }
  }, [numHarmonics, showTrail, showVelocity, showArmVectors, highlightArm, getCoeff, ptsTarget]);

  const drawWaveform = useCallback(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    const padL = 40, padR = 16, padT = 28, padB = 32;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const midY = padT + plotH / 2;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, midY);
    ctx.lineTo(padL + plotW, midY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.stroke();

    ctx.fillStyle = COLORS.axisLabel;
    ctx.font = "11px 'Courier New', monospace";
    ctx.textAlign = "right";
    ctx.fillText("1.0", padL - 6, padT + 4);
    ctx.fillText("0", padL - 6, midY + 4);
    ctx.fillText("-1.0", padL - 6, padT + plotH + 4);
    ctx.textAlign = "center";
    ctx.fillText("0", padL, padT + plotH + 16);
    ctx.fillText("π", padL + plotW / 2, padT + plotH + 16);
    ctx.fillText("2π", padL + plotW, padT + plotH + 16);

    // Ideal square wave
    const sqH = plotH / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, midY - sqH); ctx.lineTo(padL + plotW / 2 - 1, midY - sqH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padL + plotW / 2, midY - sqH); ctx.lineTo(padL + plotW / 2, midY + sqH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padL + plotW / 2 + 1, midY + sqH); ctx.lineTo(padL + plotW, midY + sqH);
    ctx.stroke();

    // Highlighted arm contribution
    if (highlightArm > 0 && highlightArm <= numHarmonics) {
      const { k, amp } = getCoeff(highlightArm);
      ctx.strokeStyle = "rgba(255,136,68,0.5)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      for (let i = 0; i <= 400; i++) {
        const theta = (i / 400) * 2 * Math.PI;
        const val = amp * Math.sin(k * theta) * 2;
        const x = padL + (i / 400) * plotW;
        const y = midY - (val / 1.2) * (plotH / 2);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Fourier sum
    const Npts = 500;
    ctx.strokeStyle = COLORS.waveform;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let maxVal = 0, maxValX = 0;
    for (let i = 0; i <= Npts; i++) {
      const theta = (i / Npts) * 2 * Math.PI;
      let val = 0;
      for (let h = 1; h <= numHarmonics; h++) {
        const { k, amp } = getCoeff(h);
        val += amp * Math.sin(k * theta) * 2;
      }
      if (Math.abs(val) > Math.abs(maxVal)) { maxVal = val; maxValX = padL + (i / Npts) * plotW; }
      const x = padL + (i / Npts) * plotW;
      const y = midY - (val / 1.2) * (plotH / 2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Gibbs marker
    if (numHarmonics >= 2 && Math.abs(maxVal) > 1.001) {
      const overshootPct = ((Math.abs(maxVal) - 1.0) * 100).toFixed(1);
      const markerY = midY - (maxVal / 1.2) * (plotH / 2);
      const targetY = midY - (1.0 / 1.2) * (plotH / 2);
      ctx.strokeStyle = COLORS.overshoot;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(maxValX, markerY); ctx.lineTo(maxValX, targetY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.overshoot;
      ctx.beginPath();
      ctx.moveTo(maxValX - 4, markerY + 6); ctx.lineTo(maxValX + 4, markerY + 6); ctx.lineTo(maxValX, markerY);
      ctx.fill();
      ctx.font = "bold 12px 'Courier New', monospace";
      ctx.textAlign = "left";
      ctx.fillText(`${overshootPct}%`, maxValX + 6, (markerY + targetY) / 2 + 4);
      if (numHarmonics >= 12) {
        ctx.fillStyle = COLORS.dim;
        ctx.font = "11px 'Courier New', monospace";
        ctx.fillText(`→ 8.95%`, maxValX + 6, (markerY + targetY) / 2 + 18);
      }
    }

    // Time cursor
    const tNorm = ((timeRef.current % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const cursorX = padL + (tNorm / (2 * Math.PI)) * plotW;
    ctx.strokeStyle = "rgba(232,197,71,0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(cursorX, padT); ctx.lineTo(cursorX, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 13px 'Georgia', serif";
    ctx.textAlign = "left";
    ctx.fillText("Waveform — Gibbs overshoot", padL, padT - 10);
    if (highlightArm > 0) {
      ctx.fillStyle = COLORS.velocity;
      ctx.font = "italic 12px 'Georgia', serif";
      ctx.fillText(`  (orange dashed = arm ${highlightArm})`, padL + 200, padT - 10);
    }
  }, [numHarmonics, highlightArm, getCoeff]);

  const drawPTS = useCallback(() => {
    const canvas = ptsCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    const padL = 52, padR = 16, padT = 28, padB = 50;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const maxPTS = ptsTarget * 1.8;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH);
    ctx.stroke();

    const targetY = padT + plotH - (ptsTarget / maxPTS) * plotH;
    if (showPTSLine) {
      ctx.strokeStyle = COLORS.plateau;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, targetY); ctx.lineTo(padL + plotW, targetY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.pts;
      ctx.font = "bold 12px 'Courier New', monospace";
      ctx.textAlign = "right";
      ctx.fillText(`J/π = ${ptsTarget.toFixed(4)}`, padL + plotW, targetY - 8);
    }

    ctx.fillStyle = COLORS.axisLabel;
    ctx.font = "11px 'Courier New', monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const val = (maxPTS * (4 - i)) / 4;
      ctx.fillText(val.toFixed(2), padL - 6, padT + (plotH * i) / 4 + 4);
    }

    const maxH2Show = Math.max(numHarmonics, 8);
    const barW = Math.min(plotW / (maxH2Show + 1) - 2, 36);

    for (let i = 1; i <= numHarmonics; i++) {
      const { k, amp } = getCoeff(i);
      const pts = k * amp;
      const isHL = highlightArm === 0 || highlightArm === i;
      const barH = (pts / maxPTS) * plotH;
      const x = padL + (i / (maxH2Show + 1)) * plotW - barW / 2;
      const y = padT + plotH - barH;

      // Two-tone: amplitude fraction vs frequency multiplier
      const ampFraction = 1 / k;
      const ampBarH = barH * ampFraction;
      const freqBarH = barH * (1 - ampFraction);

      if (isHL) {
        // Frequency contribution (top) — orange
        ctx.fillStyle = `rgba(255,136,68,${0.7})`;
        ctx.fillRect(x, y, barW, freqBarH);
        // Amplitude contribution (bottom) — gold
        ctx.fillStyle = `rgba(232,197,71,${0.7})`;
        ctx.fillRect(x, y + freqBarH, barW, ampBarH);
        ctx.strokeStyle = highlightArm === i ? COLORS.text : COLORS.pts;
        ctx.lineWidth = highlightArm === i ? 2 : 1;
        ctx.strokeRect(x, y, barW, barH);
      } else {
        ctx.fillStyle = "rgba(100,100,120,0.2)";
        ctx.fillRect(x, y, barW, barH);
        ctx.strokeStyle = "rgba(100,100,120,0.3)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, barW, barH);
      }

      if (numHarmonics <= 20 || i <= 10 || i === numHarmonics) {
        ctx.fillStyle = isHL ? COLORS.dim : "rgba(85,102,119,0.3)";
        ctx.font = "10px 'Courier New', monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${k}`, x + barW / 2, padT + plotH + 14);
      }

      if (isHL && (numHarmonics <= 14 || highlightArm === i)) {
        ctx.fillStyle = COLORS.text;
        ctx.font = "10px 'Courier New', monospace";
        ctx.textAlign = "center";
        ctx.fillText(pts.toFixed(3), x + barW / 2, y - 4);
      }

      // Inside-bar decomposition for selected arm
      if (highlightArm === i && barH > 40) {
        ctx.save();
        ctx.font = "bold 9px 'Courier New', monospace";
        ctx.textAlign = "center";
        if (freqBarH > 14) {
          ctx.fillStyle = "rgba(10,10,15,0.9)";
          ctx.fillText(`×${k}`, x + barW / 2, y + freqBarH / 2 + 3);
        }
        if (ampBarH > 14) {
          ctx.fillStyle = "rgba(10,10,15,0.9)";
          ctx.fillText(`A=${amp.toFixed(2)}`, x + barW / 2, y + freqBarH + ampBarH / 2 + 3);
        }
        ctx.restore();
      }
    }

    ctx.fillStyle = COLORS.axisLabel;
    ctx.font = "11px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText("harmonic k (odd)", padL + plotW / 2, padT + plotH + 28);

    // Legend
    ctx.textAlign = "left";
    ctx.font = "11px 'Courier New', monospace";
    ctx.fillStyle = COLORS.velocity;
    ctx.fillRect(padL, padT + plotH + 38, 10, 10);
    ctx.fillText("freq ×", padL + 14, padT + plotH + 47);
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(padL + 68, padT + plotH + 38, 10, 10);
    ctx.fillText("amplitude = tip speed", padL + 82, padT + plotH + 47);

    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 13px 'Georgia', serif";
    ctx.textAlign = "left";
    ctx.fillText("Phasor Tip Speed: k · Aₖ", padL, padT - 10);
  }, [numHarmonics, getCoeff, ptsTarget, showPTSLine, highlightArm]);

  const frameCountRef = useRef(0);
  const setManualPosRef = useRef(setManualPos);
  setManualPosRef.current = setManualPos;

  useEffect(() => {
    let running = true;
    const loop = (now) => {
      if (!running) return;
      const dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      if (playingRef.current) {
        timeRef.current += dt * speed * 1.5;
        // Sync position slider every 6 frames to avoid excess re-renders
        frameCountRef.current++;
        if (frameCountRef.current % 6 === 0) {
          const deg = ((timeRef.current / Math.PI) * 180) % 360;
          setManualPosRef.current(deg < 0 ? deg + 360 : deg);
        }
      }
      drawPhasors();
      drawWaveform();
      drawPTS();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [drawPhasors, drawWaveform, drawPTS, speed]);

  useEffect(() => { trailRef.current = []; }, [numHarmonics]);
  useEffect(() => { if (highlightArm > numHarmonics) setHighlightArm(0); }, [numHarmonics, highlightArm]);

  const btnStyle = (active, color) => ({
    padding: "6px 14px",
    background: active ? color : "transparent",
    color: active ? COLORS.bg : color,
    border: `1px solid ${color}`,
    borderRadius: 4,
    cursor: "pointer",
    fontSize: "0.82rem",
    fontFamily: "'Courier New', monospace",
  });

  const armBtnStyle = (i) => ({
    padding: "3px 7px",
    background: highlightArm === i ? COLORS.velocity : "transparent",
    color: highlightArm === i ? COLORS.bg : COLORS.velocity,
    border: `1px solid ${highlightArm === i ? COLORS.velocity : "rgba(255,136,68,0.3)"}`,
    borderRadius: 3,
    cursor: "pointer",
    fontSize: "0.75rem",
    fontFamily: "'Courier New', monospace",
    minWidth: 28,
  });

  return (
    <div style={{
      background: COLORS.bg,
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      fontFamily: "'Georgia', serif",
      color: COLORS.text,
      padding: "20px",
    }}>
      <div style={{ maxWidth: 960, width: "100%" }}>
        <h1 style={{
          fontSize: "1.6rem", color: COLORS.gold, fontWeight: 400,
          letterSpacing: "0.03em", marginBottom: 4, textAlign: "center",
        }}>
          The Gibbs Overshoot Is Built In
        </h1>
        <p style={{
          fontSize: "0.95rem", color: COLORS.dim, marginBottom: 20,
          fontStyle: "italic", textAlign: "center",
        }}>
          Every arm gets shorter — but spins faster. The tip speed converges to J/π. The overshoot never goes away.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div style={{
            position: "relative", paddingBottom: "100%", borderRadius: 8,
            overflow: "hidden", border: `1px solid ${COLORS.grid}`,
          }}>
            <canvas ref={phasorCanvasRef} style={{
              position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
            }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{
              position: "relative", paddingBottom: "50%", borderRadius: 8,
              overflow: "hidden", border: `1px solid ${COLORS.grid}`,
            }}>
              <canvas ref={waveCanvasRef} style={{
                position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
              }} />
            </div>
            <div style={{
              position: "relative", paddingBottom: "50%", borderRadius: 8,
              overflow: "hidden", border: `1px solid ${COLORS.grid}`,
            }}>
              <canvas ref={ptsCanvasRef} style={{
                position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
              }} />
            </div>
          </div>
        </div>

        <div style={{
          padding: "16px 20px", background: "#0e0e18", borderRadius: 8,
          border: `1px solid ${COLORS.grid}`, marginBottom: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
            <label style={{ fontSize: "0.9rem", color: COLORS.dim, minWidth: 90 }}>Harmonics</label>
            <input type="range" min={1} max={40} step={1} value={numHarmonics}
              onChange={(e) => setNumHarmonics(Number(e.target.value))}
              style={{ flex: 1, accentColor: COLORS.gold }} />
            <span style={{ fontFamily: "'Courier New', monospace", fontSize: "0.9rem", color: COLORS.gold, minWidth: 30, textAlign: "right" }}>
              {numHarmonics}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
            <label style={{ fontSize: "0.9rem", color: COLORS.dim, minWidth: 90 }}>Speed</label>
            <input type="range" min={0.1} max={3.0} step={0.1} value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              style={{ flex: 1, accentColor: COLORS.gold }} />
            <span style={{ fontFamily: "'Courier New', monospace", fontSize: "0.9rem", color: COLORS.gold, minWidth: 30, textAlign: "right" }}>
              {speed.toFixed(1)}×
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
            <label style={{ fontSize: "0.9rem", color: COLORS.dim, minWidth: 90 }}>Position</label>
            <input type="range" min={0} max={360} step={0.5} value={manualPos}
              onChange={(e) => {
                const deg = Number(e.target.value);
                setManualPos(deg);
                setPlaying(false);
                timeRef.current = (deg / 180) * Math.PI;
                trailRef.current = [];
              }}
              style={{ flex: 1, accentColor: COLORS.blue }} />
            <span style={{ fontFamily: "'Courier New', monospace", fontSize: "0.9rem", color: COLORS.blue, minWidth: 42, textAlign: "right" }}>
              {manualPos.toFixed(0)}°
            </span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginBottom: 12 }}>
            <button onClick={() => setPlaying(!playing)} style={btnStyle(playing, COLORS.gold)}>
              {playing ? "Pause" : "Play"}
            </button>
            <button onClick={() => setShowTrail(!showTrail)} style={btnStyle(showTrail, COLORS.gold)}>
              {showTrail ? "Hide" : "Show"} orbits
            </button>
            <button onClick={() => setShowVelocity(!showVelocity)} style={btnStyle(showVelocity, COLORS.velocity)}>
              {showVelocity ? "Hide" : "Show"} velocity
            </button>
            <button onClick={() => setShowArmVectors(!showArmVectors)} style={btnStyle(showArmVectors, "#da77f2")}>
              {showArmVectors ? "Hide" : "Show"} arm vectors
            </button>
            <button onClick={() => setShowPTSLine(!showPTSLine)} style={btnStyle(showPTSLine, COLORS.pts)}>
              {showPTSLine ? "Hide" : "Show"} J/π
            </button>
            <button onClick={() => { timeRef.current = 0; trailRef.current = []; }} style={btnStyle(false, COLORS.dim)}>
              Reset
            </button>
          </div>

          <div style={{
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            justifyContent: "center", borderTop: `1px solid ${COLORS.grid}`, paddingTop: 12,
          }}>
            <span style={{ fontSize: "0.82rem", color: COLORS.dim }}>Inspect arm:</span>
            <button onClick={() => setHighlightArm(0)} style={armBtnStyle(0)}>All</button>
            {Array.from({ length: Math.min(numHarmonics, 20) }, (_, i) => (
              <button key={i + 1} onClick={() => setHighlightArm(i + 1)} style={armBtnStyle(i + 1)}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        <div style={{
          padding: "16px 20px", background: "#0e0e18", borderRadius: 8,
          border: `1px solid ${COLORS.grid}`, fontSize: "0.9rem", lineHeight: 1.7,
        }}>
          <div style={{ display: "flex", gap: 20, marginBottom: 12, flexWrap: "wrap" }}>
            <span><span style={{ color: COLORS.gold }}>━━</span> Phasor arms</span>
            <span><span style={{ color: COLORS.velocity }}>→</span> Resultant tip velocity</span>
            <span><span style={{ color: "#da77f2" }}>→</span> Arm vectors</span>
            <span><span style={{ color: COLORS.waveform }}>━━</span> Fourier sum</span>
            <span><span style={{ color: COLORS.overshoot }}>━━</span> Gibbs overshoot</span>
            <span><span style={{ color: COLORS.pts }}>╌╌</span> J/π plateau</span>
          </div>
          <p style={{ color: COLORS.dim, margin: "8px 0 0 0" }}>
            The <span style={{ color: COLORS.velocity }}>orange arrow</span> shows the instantaneous
            velocity of the <span style={{ color: COLORS.gold }}>resultant tip</span> — the endpoint
            of the full phasor chain. Each arm contributes a tangential velocity of k·Aₖ ≈
            <span style={{ color: COLORS.pts }}> J/π ≈ {ptsTarget.toFixed(4)}</span>.
            Near the discontinuity, all contributions align and the resultant tip accelerates.
            That is the overshoot — the chain tip racing through 0.637 because every arm pushes in the same direction.
          </p>
          <p style={{ color: COLORS.dim, margin: "8px 0 0 0" }}>
            The two-tone bars decompose each arm's tip speed into
            <span style={{ color: COLORS.velocity }}> frequency multiplier</span> ×
            <span style={{ color: COLORS.gold }}> amplitude</span>.
            As k grows, the orange portion dominates — the arm is tiny but spinning furiously.
            Yet the total height stays locked at J/π. Every harmonic contributes equally to the
            resultant velocity at the jump. That is why the Gibbs overshoot converges to ≈ 8.95%
            and never vanishes — it is a Euclidean invariant.
          </p>
        </div>
      </div>
    </div>
  );
}
