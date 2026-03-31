#!/usr/bin/env python3
"""
Morphogenesis — Experimental multi-vocabulary generative animation.

Three rendering vocabularies (ASCII-video, Manim-geometry, p5.js-generative)
cohabit a single canvas, modulating each other in a continuous abstract system.

Usage:
    python morphogenesis.py                    # preview: 960x960, 10s
    python morphogenesis.py --quality high     # full: 3840x3840, 60s
    python morphogenesis.py --quality medium   # mid: 1920x1920, 30s
    python morphogenesis.py --test-frame 300   # render single frame
"""

import argparse
import math
import os
import random
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

# ═══════════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════════

QUALITY = {
    "preview": {"W": 960, "H": 960, "fps": 24, "duration": 12, "crf": 23},
    "medium": {"W": 1920, "H": 1920, "fps": 24, "duration": 30, "crf": 20},
    "high": {"W": 3840, "H": 3840, "fps": 24, "duration": 60, "crf": 18},
}

# Font selection (macOS)
FONT_PATHS = [
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/Monaco.dfont",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
]

# Character palettes
PAL_BRAILLE = "⠁⠂⠄⠈⠐⠠⡀⢀⣀⣠⣤⣦⣶⣷⣾⣿"
PAL_RUNE = " ·∘◦○◎●◉⊙ᚠᚢᚦᚨᚱᚲᚷᚹ"
PAL_BLOCKS = " ░▒▓█▄▀▌▐▊▋▍▎"
PAL_DENSE = " .,-~:;=!*#$@"
PAL_MATH = " ·∂∇∫∮∞≈≡±×÷√∑∏"
PAL_KANJI = " ·ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘ"
PAL_DOTS = " ·•●◦∘⬤"

# ═══════════════════════════════════════════════════════════════════
# COLOR MATH
# ═══════════════════════════════════════════════════════════════════


def hsv2rgb(h, s, v):
    """Vectorized HSV→RGB. All float32 arrays."""
    h = h % 1.0
    c = v * s
    x = c * (1 - np.abs((h * 6) % 2 - 1))
    m = v - c
    r = np.zeros_like(h)
    g = np.zeros_like(h)
    b = np.zeros_like(h)
    mask = h < 1 / 6
    r[mask] = c[mask]
    g[mask] = x[mask]
    mask = (h >= 1 / 6) & (h < 2 / 6)
    r[mask] = x[mask]
    g[mask] = c[mask]
    mask = (h >= 2 / 6) & (h < 3 / 6)
    g[mask] = c[mask]
    b[mask] = x[mask]
    mask = (h >= 3 / 6) & (h < 4 / 6)
    g[mask] = x[mask]
    b[mask] = c[mask]
    mask = (h >= 4 / 6) & (h < 5 / 6)
    r[mask] = x[mask]
    b[mask] = c[mask]
    mask = h >= 5 / 6
    r[mask] = c[mask]
    b[mask] = x[mask]
    R = np.clip((r + m) * 255, 0, 255).astype(np.uint8)
    G = np.clip((g + m) * 255, 0, 255).astype(np.uint8)
    B = np.clip((b + m) * 255, 0, 255).astype(np.uint8)
    return R, G, B


def rgb2hsv_canvas(c):
    """Canvas uint8 (H,W,3) → (h, s, v) float32 arrays."""
    rf = c[:, :, 0].astype(np.float32) / 255.0
    gf = c[:, :, 1].astype(np.float32) / 255.0
    bf = c[:, :, 2].astype(np.float32) / 255.0
    cmax = np.maximum(np.maximum(rf, gf), bf)
    cmin = np.minimum(np.minimum(rf, gf), bf)
    delta = cmax - cmin + 1e-10
    h = np.zeros_like(rf)
    m = cmax == rf
    h[m] = ((gf[m] - bf[m]) / delta[m]) % 6
    m = cmax == gf
    h[m] = (bf[m] - rf[m]) / delta[m] + 2
    m = cmax == bf
    h[m] = (rf[m] - gf[m]) / delta[m] + 4
    h = h / 6.0 % 1.0
    s = np.where(cmax > 0, delta / (cmax + 1e-10), 0)
    return h, s, cmax


def mkc(R, G, B, rows, cols):
    o = np.zeros((rows, cols, 3), dtype=np.uint8)
    o[:, :, 0] = R
    o[:, :, 1] = G
    o[:, :, 2] = B
    return o


# ═══════════════════════════════════════════════════════════════════
# GRID & FONT SYSTEM
# ═══════════════════════════════════════════════════════════════════


class Grid:
    """Character grid at a specific density."""

    def __init__(self, VW, VH, font_size, font_path):
        self.VW, self.VH = VW, VH
        self.font = ImageFont.truetype(font_path, font_size)
        # Measure cell dimensions
        asc, desc = self.font.getmetrics()
        self.ch = asc + desc
        bbox = self.font.getbbox("M")
        self.cw = bbox[2] - bbox[0]
        self.rows = max(1, VH // self.ch)
        self.cols = max(1, VW // self.cw)
        # Precompute coordinate arrays
        rr, cc = np.mgrid[0 : self.rows, 0 : self.cols]
        self.rr = rr.astype(np.float32)
        self.cc = cc.astype(np.float32)
        cy, cx = self.rows / 2, self.cols / 2
        self.dist = np.sqrt((self.cc - cx) ** 2 + (self.rr - cy) ** 2)
        max_d = max(np.sqrt(cx**2 + cy**2), 1)
        self.dist_n = self.dist / max_d
        self.angle = np.arctan2(self.rr - cy, self.cc - cx)
        # Bitmap glyph cache
        self._cache = {}

    def _get_glyph(self, char, color):
        """Cached character bitmap."""
        key = (char, color[0], color[1], color[2])
        if key not in self._cache:
            img = Image.new("RGB", (self.cw, self.ch), (0, 0, 0))
            draw = ImageDraw.Draw(img)
            draw.text((0, 0), char, fill=tuple(color), font=self.font)
            self._cache[key] = np.array(img, dtype=np.uint8)
        return self._cache[key]

    def render(self, chars, colors):
        """Render char+color arrays to pixel canvas."""
        canvas = np.zeros((self.VH, self.VW, 3), dtype=np.uint8)
        for r in range(self.rows):
            y0 = r * self.ch
            if y0 + self.ch > self.VH:
                break
            for c in range(self.cols):
                x0 = c * self.cw
                if x0 + self.cw > self.VW:
                    break
                ch = chars[r, c]
                if ch == " ":
                    continue
                co = colors[r, c]
                if co[0] == 0 and co[1] == 0 and co[2] == 0:
                    continue
                glyph = self._get_glyph(ch, co)
                h_slice = min(self.ch, self.VH - y0)
                w_slice = min(self.cw, self.VW - x0)
                region = canvas[y0 : y0 + h_slice, x0 : x0 + w_slice]
                glyph_crop = glyph[:h_slice, :w_slice]
                # Screen blend: brighter of existing or new
                np.maximum(region, glyph_crop, out=region)
        return canvas


def val2char(val, mask, pal):
    """Map float [0,1] to character from palette."""
    n = len(pal)
    idx = np.clip((val * (n - 1)).astype(int), 0, n - 1)
    chars = np.full(val.shape, " ", dtype="U1")
    for i in range(n):
        m = mask & (idx == i)
        chars[m] = pal[i]
    return chars


class GridSystem:
    """Manages multiple grids at different densities."""

    def __init__(self, VW, VH, font_path):
        sizes = {"xs": 8, "sm": 11, "md": 16, "lg": 22, "xl": 32, "xxl": 44}
        self.grids = {}
        for key, sz in sizes.items():
            try:
                self.grids[key] = Grid(VW, VH, sz, font_path)
            except Exception:
                pass

    def get(self, key):
        return self.grids[key]


# ═══════════════════════════════════════════════════════════════════
# NOISE & VALUE FIELD GENERATORS
# ═══════════════════════════════════════════════════════════════════


def _hash2d(ix, iy):
    n = ix.astype(np.int64) * 374761393 + iy.astype(np.int64) * 668265263
    n = (n ^ (n >> 13)) * 1274126177
    return ((n ^ (n >> 16)) & 0x7FFFFFFF).astype(np.float32) / 0x7FFFFFFF


def _smootherstep(t):
    t = np.clip(t, 0, 1)
    return t * t * t * (t * (t * 6 - 15) + 10)


def _value_noise_2d(x, y):
    ix = np.floor(x).astype(np.int64)
    iy = np.floor(y).astype(np.int64)
    fx = _smootherstep(x - ix.astype(np.float32))
    fy = _smootherstep(y - iy.astype(np.float32))
    n00 = _hash2d(ix, iy)
    n10 = _hash2d(ix + 1, iy)
    n01 = _hash2d(ix, iy + 1)
    n11 = _hash2d(ix + 1, iy + 1)
    nx0 = n00 * (1 - fx) + n10 * fx
    nx1 = n01 * (1 - fx) + n11 * fx
    return nx0 * (1 - fy) + nx1 * fy


def vf_fbm(g, t, octaves=5, freq=0.06, speed=0.2, bri=0.8):
    val = np.zeros((g.rows, g.cols), dtype=np.float32)
    amp = 1.0
    fx, fy = freq, freq * 0.85
    for i in range(octaves):
        phase = t * speed * (1 + i * 0.3)
        val += (
            _value_noise_2d(
                g.cc * fx + phase + i * 17.3, g.rr * fy - phase * 0.6 + i * 31.7
            )
            * amp
        )
        amp *= 0.5
        fx *= 2.0
        fy *= 2.0
    mx = (1 - 0.5**octaves) / 0.5
    return np.clip(val / mx * bri, 0, 1)


def vf_domain_warp(g, t, freq=0.06, speed=0.2, strength=15.0):
    wx = _value_noise_2d(g.cc * freq * 1.3 + t * speed, g.rr * freq + 7.1)
    wy = _value_noise_2d(g.cc * freq + t * speed * 0.7 + 3.2, g.rr * freq * 1.1 - 11.8)
    wx = (wx - 0.5) * strength
    wy = (wy - 0.5) * strength
    wcc = g.cc + wx
    wrr = g.rr + wy
    val = np.zeros((g.rows, g.cols), dtype=np.float32)
    amp = 1.0
    fx, fy = freq * 0.8, freq * 0.7
    for i in range(4):
        val += (
            _value_noise_2d(
                wcc * fx + t * speed * 0.5 + i * 13.7,
                wrr * fy - t * speed * 0.3 + i * 27.3,
            )
            * amp
        )
        amp *= 0.5
        fx *= 2.0
        fy *= 2.0
    return np.clip(val / 1.875 * 0.8, 0, 1)


def vf_plasma(g, t):
    v = np.sin(g.cc * 0.03 + t * 0.7) * 0.5
    v += np.sin(g.rr * 0.04 - t * 0.5) * 0.4
    v += np.sin((g.cc * 0.02 + g.rr * 0.03) + t * 0.3) * 0.3
    v += np.sin(g.dist_n * 4 - t * 0.8) * 0.3
    return np.clip(v * 0.5 + 0.5, 0, 1)


def vf_spiral(g, t, n_arms=3, tightness=2.5):
    val = np.zeros((g.rows, g.cols), dtype=np.float32)
    for ai in range(n_arms):
        offset = ai * 2 * np.pi / n_arms
        log_r = np.log(g.dist + 1) * tightness
        arm_phase = g.angle + offset - log_r + t * 0.8
        arm_val = np.clip(np.cos(arm_phase * n_arms) * 0.6 + 0.2, 0, 1)
        arm_val *= np.clip(1 - g.dist_n * 0.5, 0.2, 1)
        val = np.maximum(val, arm_val)
    return val


def vf_tunnel(g, t, speed=3.0, complexity=6):
    tunnel_d = 1.0 / (g.dist_n + 0.1)
    v1 = np.sin(tunnel_d * 2 - t * speed) * 0.45 + 0.55
    v2 = np.sin(g.angle * complexity + tunnel_d * 1.5 - t * 2) * 0.35 + 0.55
    return np.clip(v1 * 0.5 + v2 * 0.5, 0, 1)


def vf_interference(g, t, n_waves=6):
    vals = np.zeros((g.rows, g.cols), dtype=np.float32)
    for i in range(n_waves):
        angle = i * np.pi / n_waves
        freq = 0.06 + i * 0.03
        sp = 0.5 + i * 0.3
        proj = g.cc * np.cos(angle) + g.rr * np.sin(angle)
        vals += np.sin(proj * freq + t * sp) * 0.4
    return np.clip(vals * 0.12 + 0.45, 0.1, 1)


# ═══════════════════════════════════════════════════════════════════
# REACTION-DIFFUSION (Gray-Scott)
# ═══════════════════════════════════════════════════════════════════


class ReactionDiffusion:
    """Gray-Scott model with parameter morphing."""

    def __init__(self, rows, cols, feed=0.055, kill=0.062):
        self.rows, self.cols = rows, cols
        self.A = np.ones((rows, cols), dtype=np.float32)
        self.B = np.zeros((rows, cols), dtype=np.float32)
        self.feed = feed
        self.kill = kill
        # Seed spots
        rng = np.random.RandomState(42)
        for _ in range(max(5, rows * cols // 150)):
            r, c = rng.randint(2, rows - 2), rng.randint(2, cols - 2)
            self.B[r - 1 : r + 2, c - 1 : c + 2] = 1.0

    def step(self, steps=6, feed=None, kill=None):
        f = feed if feed is not None else self.feed
        k = kill if kill is not None else self.kill
        A, B = self.A, self.B
        for _ in range(steps):
            pA = np.pad(A, 1, mode="wrap")
            pB = np.pad(B, 1, mode="wrap")
            lapA = (
                (pA[:-2, 1:-1] + pA[2:, 1:-1] + pA[1:-1, :-2] + pA[1:-1, 2:]) * 0.2
                + (pA[:-2, :-2] + pA[:-2, 2:] + pA[2:, :-2] + pA[2:, 2:]) * 0.05
                - A
            )
            lapB = (
                (pB[:-2, 1:-1] + pB[2:, 1:-1] + pB[1:-1, :-2] + pB[1:-1, 2:]) * 0.2
                + (pB[:-2, :-2] + pB[:-2, 2:] + pB[2:, :-2] + pB[2:, 2:]) * 0.05
                - B
            )
            ABB = A * B * B
            A = np.clip(A + 1.0 * lapA - ABB + f * (1 - A), 0, 1)
            B = np.clip(B + 0.5 * lapB + ABB - (f + k) * B, 0, 1)
        self.A, self.B = A, B
        return np.clip(B * 2.0, 0, 1)

    def get_lissajous_params(self, t, duration):
        """Trace Lissajous path through (feed, kill) parameter space."""
        # Sweet spot centers and ranges
        f_center, f_range = 0.042, 0.018
        k_center, k_range = 0.062, 0.006
        phase = t / duration * 2 * np.pi
        feed = f_center + f_range * np.sin(phase * 3.0 + 0.5)
        kill = k_center + k_range * np.sin(phase * 2.0)
        return max(0.020, min(0.065, feed)), max(0.050, min(0.070, kill))


# ═══════════════════════════════════════════════════════════════════
# STRANGE ATTRACTOR
# ═══════════════════════════════════════════════════════════════════


def strange_attractor_field(g, t, n_points=30000, warmup=200):
    """Clifford attractor → density field with time-varying params."""
    a = -1.4 + np.sin(t * 0.05) * 0.4
    b = 1.6 + np.cos(t * 0.07) * 0.3
    c = 1.0 + np.sin(t * 0.03 + 1) * 0.4
    d = 0.7 + np.cos(t * 0.04 + 2) * 0.3
    rng = np.random.RandomState(42)
    x = rng.uniform(-0.1, 0.1, n_points).astype(np.float64)
    y = rng.uniform(-0.1, 0.1, n_points).astype(np.float64)
    for _ in range(warmup):
        xn = np.sin(a * y) + c * np.cos(a * x)
        yn = np.sin(b * x) + d * np.cos(b * y)
        x, y = xn, yn
    margin = 0.1
    x_min, x_max = x.min() - margin, x.max() + margin
    y_min, y_max = y.min() - margin, y.max() + margin
    gx = ((x - x_min) / (x_max - x_min) * (g.cols - 1)).astype(np.int32)
    gy = ((y - y_min) / (y_max - y_min) * (g.rows - 1)).astype(np.int32)
    valid = (gx >= 0) & (gx < g.cols) & (gy >= 0) & (gy < g.rows)
    density = np.zeros((g.rows, g.cols), dtype=np.float32)
    np.add.at(density, (gy[valid], gx[valid]), 1.0)
    density = np.log1p(density)
    mx = density.max()
    if mx > 0:
        density /= mx
    return np.clip(density * 0.9, 0, 1)


# ═══════════════════════════════════════════════════════════════════
# CELLULAR AUTOMATA (Game of Life with fade trails)
# ═══════════════════════════════════════════════════════════════════


class CellularAutomata:
    def __init__(self, rows, cols, density=0.25, rule="day_night", seed=42):
        rng = np.random.RandomState(seed)
        self.grid = (rng.random((rows, cols)) < density).astype(np.float32)
        self.display = self.grid.copy()
        self.rows, self.cols = rows, cols
        presets = {
            "life": ({3}, {2, 3}),
            "coral": ({3}, {4, 5, 6, 7, 8}),
            "maze": ({3}, {1, 2, 3, 4, 5}),
            "anneal": ({4, 6, 7, 8}, {3, 5, 6, 7, 8}),
            "day_night": ({3, 6, 7, 8}, {3, 4, 6, 7, 8}),
        }
        self.birth, self.survive = presets.get(rule, presets["life"])

    def step(self, inject_noise=False):
        if inject_noise:
            self.grid = np.clip(
                self.grid
                + (np.random.random((self.rows, self.cols)) < 0.015).astype(np.float32),
                0,
                1,
            )
        padded = np.pad(self.grid > 0.5, 1, mode="wrap").astype(np.int8)
        nb = (
            padded[:-2, :-2]
            + padded[:-2, 1:-1]
            + padded[:-2, 2:]
            + padded[1:-1, :-2]
            + padded[1:-1, 2:]
            + padded[2:, :-2]
            + padded[2:, 1:-1]
            + padded[2:, 2:]
        )
        alive = self.grid > 0.5
        new_alive = np.zeros_like(self.grid, dtype=bool)
        for b in self.birth:
            new_alive |= (~alive) & (nb == b)
        for s in self.survive:
            new_alive |= alive & (nb == s)
        self.grid = new_alive.astype(np.float32)
        self.display = np.where(self.grid > 0.5, 1.0, self.display * 0.92)
        return np.clip(self.display, 0, 1)


# ═══════════════════════════════════════════════════════════════════
# VORONOI
# ═══════════════════════════════════════════════════════════════════


def vf_voronoi(g, t, n_cells=16, speed=0.3, mode="edge"):
    rng = np.random.RandomState(42)
    cx = rng.rand(n_cells).astype(np.float32) * g.cols
    cy = rng.rand(n_cells).astype(np.float32) * g.rows
    cx_t = (cx + np.sin(t * 0.5 + np.arange(n_cells) * 0.8) * speed * 10) % g.cols
    cy_t = (cy + np.cos(t * 0.4 + np.arange(n_cells) * 1.1) * speed * 10) % g.rows
    d1 = np.full((g.rows, g.cols), 1e9, dtype=np.float32)
    d2 = np.full((g.rows, g.cols), 1e9, dtype=np.float32)
    for i in range(n_cells):
        d = np.sqrt((g.cc - cx_t[i]) ** 2 + (g.rr - cy_t[i]) ** 2)
        mask = d < d1
        d2 = np.where(mask, d1, np.minimum(d2, d))
        d1 = np.minimum(d1, d)
    edge_val = np.clip(1.0 - (d2 - d1) / 1.5, 0, 1)
    return edge_val * 0.8


# ═══════════════════════════════════════════════════════════════════
# MANIM PIXEL LAYER — smooth anti-aliased vector geometry
# Renders directly to pixel canvas, NO ASCII grid
# ═══════════════════════════════════════════════════════════════════


class ManimPixelLayer:
    """Smooth vector geometry rendered at pixel resolution.
    Anti-aliased lines, parametric curves, morphing shapes, equation glyphs.
    Renders at 2x then downscales for free anti-aliasing."""

    def __init__(self, W, H, font_path):
        self.W, self.H = W, H
        self.ss = 2 if W >= 1920 else 1  # supersample only at high res
        self.ssW, self.ssH = W * self.ss, H * self.ss
        # Load a large font for equation text
        try:
            self.eq_font = ImageFont.truetype(font_path, max(18, W // 30))
            self.label_font = ImageFont.truetype(font_path, max(12, W // 50))
        except Exception:
            self.eq_font = ImageFont.load_default()
            self.label_font = ImageFont.load_default()

    def render(self, t):
        """Render smooth geometry to (H, W, 3) uint8 canvas."""
        img = Image.new("RGB", (self.ssW, self.ssH), (0, 0, 0))
        draw = ImageDraw.Draw(img)
        cx, cy = self.ssW / 2, self.ssH / 2

        # === Parametric Lissajous curves ===
        for k in range(5):
            n_pts = 600
            theta = np.linspace(0, 2 * np.pi, n_pts)
            freq_a = 3 + k * 0.7
            freq_b = 2 + k * 1.1
            phase = t * (0.3 + k * 0.08) + k * 1.2
            amp = 0.32 - k * 0.03
            px = cx + amp * self.ssW * np.sin(freq_a * theta + phase) * np.cos(
                theta * 0.3 + t * 0.05
            )
            py = cy + amp * self.ssH * np.cos(freq_b * theta + phase * 0.6) * np.sin(
                theta * 0.2 + t * 0.07
            )
            # Draw as connected line segments
            points = list(zip(px.tolist(), py.tolist()))
            # Color: white-cyan with per-curve hue shift
            hue_base = (t * 0.02 + k * 0.12) % 1.0
            r_c = int(180 + 75 * math.sin(hue_base * 2 * math.pi))
            g_c = int(200 + 55 * math.sin(hue_base * 2 * math.pi + 2.1))
            b_c = int(220 + 35 * math.sin(hue_base * 2 * math.pi + 4.2))
            color = (min(255, r_c), min(255, g_c), min(255, b_c))
            width = max(2, 5 - k)  # thicker lines for visibility
            draw.line(points, fill=color, width=width)

        # === Morphing SDF shape as smooth contour ===
        morph = math.sin(t * 0.25) * 0.5 + 0.5
        rot = t * 0.15
        n_contour = 500
        for ci, (radius_mul, alpha) in enumerate([(1.0, 200), (0.7, 120), (1.3, 80)]):
            contour_pts = []
            for i in range(n_contour):
                a = 2 * math.pi * i / n_contour
                # Morph between circle and star
                r_circle = 0.28 * radius_mul
                r_star = (0.25 + 0.08 * math.cos(a * 5 + t * 0.5)) * radius_mul
                r_shape = r_circle * (1 - morph) + r_star * morph
                # Rotate
                ra = a + rot
                px = cx + r_shape * self.ssW * math.cos(ra)
                py = cy + r_shape * self.ssH * math.sin(ra)
                contour_pts.append((px, py))
            contour_pts.append(contour_pts[0])  # close
            color_v = int(alpha * (0.7 + 0.3 * math.sin(t * 0.5 + ci)))
            draw.line(
                contour_pts,
                fill=(color_v, int(min(255, color_v * 1.3)), 255),
                width=max(2, 4 - ci),  # thicker contours
            )

        # === Golden spiral ===
        spiral_pts = []
        phi = (1 + math.sqrt(5)) / 2
        for i in range(400):
            a = i * 0.08 + t * 0.3
            r_sp = 0.008 * (phi ** (a / (2 * math.pi))) * self.ssW * 0.15
            if r_sp > self.ssW * 0.45:
                break
            sx = cx + r_sp * math.cos(a + t * 0.1)
            sy = cy + r_sp * math.sin(a + t * 0.1)
            spiral_pts.append((sx, sy))
        if len(spiral_pts) > 2:
            draw.line(spiral_pts, fill=(255, 210, 120), width=3)

        # === Equation text rendered as pixel glyphs ===
        equations = [
            "∇²u = f(u,v)",
            "∂B/∂t = D∇²B + AB² − (f+k)B",
            "z → z² + c",
            "eiπ + 1 = 0",
        ]
        eq_idx = int(t * 0.15) % len(equations)
        eq_text = equations[eq_idx]
        # Fade alpha based on sub-position
        eq_alpha = int(200 * (0.5 + 0.5 * math.sin(t * 0.4)))
        try:
            bbox = draw.textbbox((0, 0), eq_text, font=self.eq_font)
            tw = bbox[2] - bbox[0]
            tx = int(cx - tw / 2 + math.sin(t * 0.2) * self.ssW * 0.1)
            ty = int(self.ssH * 0.12 + math.cos(t * 0.15) * self.ssH * 0.05)
            draw.text(
                (tx, ty),
                eq_text,
                fill=(eq_alpha, int(eq_alpha * 0.9), eq_alpha),
                font=self.eq_font,
            )
        except Exception:
            pass

        # === Coordinate grid (faint, rotating) ===
        grid_alpha = int(40 + 20 * math.sin(t * 0.3))
        grid_color = (grid_alpha, grid_alpha, int(grid_alpha * 1.3))
        grid_rot = t * 0.03
        spacing = self.ssW // 12
        for i in range(-8, 9):
            # Horizontal lines (rotated)
            y_off = i * spacing
            x0 = -self.ssW * 0.6
            x1 = self.ssW * 0.6
            p0 = (
                cx + x0 * math.cos(grid_rot) - y_off * math.sin(grid_rot),
                cy + x0 * math.sin(grid_rot) + y_off * math.cos(grid_rot),
            )
            p1 = (
                cx + x1 * math.cos(grid_rot) - y_off * math.sin(grid_rot),
                cy + x1 * math.sin(grid_rot) + y_off * math.cos(grid_rot),
            )
            draw.line([p0, p1], fill=grid_color, width=1)
            # Vertical lines
            x_off = i * spacing
            y0 = -self.ssH * 0.6
            y1 = self.ssH * 0.6
            p0 = (
                cx + x_off * math.cos(grid_rot) - y0 * math.sin(grid_rot),
                cy + x_off * math.sin(grid_rot) + y0 * math.cos(grid_rot),
            )
            p1 = (
                cx + x_off * math.cos(grid_rot) - y1 * math.sin(grid_rot),
                cy + x_off * math.sin(grid_rot) + y1 * math.cos(grid_rot),
            )
            draw.line([p0, p1], fill=grid_color, width=1)

        # Downsample if supersampled
        if self.ss > 1:
            img = img.resize((self.W, self.H), Image.LANCZOS)
        return np.array(img, dtype=np.uint8)


# ═══════════════════════════════════════════════════════════════════
# P5JS PIXEL LAYER — continuous gradient fields & smooth particles
# Renders directly to pixel canvas, NO ASCII grid
# ═══════════════════════════════════════════════════════════════════


class P5jsPixelLayer:
    """Continuous generative art rendered at pixel resolution.
    Smooth noise gradients, flow field particle trails, attractor density."""

    def __init__(self, W, H):
        self.W, self.H = W, H
        # Persistent particle trail buffer at full pixel resolution
        self.trail_buf = np.zeros((H, W, 3), dtype=np.float32)
        # Particle positions (work at pixel scale)
        n = 3000
        rng = np.random.RandomState(77)
        self.px = rng.uniform(0, W, n).astype(np.float32)
        self.py = rng.uniform(0, H, n).astype(np.float32)
        self.pvx = np.zeros(n, dtype=np.float32)
        self.pvy = np.zeros(n, dtype=np.float32)
        self.plife = rng.uniform(0.5, 1.0, n).astype(np.float32)
        self.n = n
        self._attr_cache = None
        self._attr_cache_frame = -99

    def render(self, t, rd_field=None):
        """Render continuous fields + particle trails to (H, W, 3) uint8."""
        W, H = self.W, self.H
        canvas = np.zeros((H, W, 3), dtype=np.float32)

        # === Continuous noise field (domain-warped fBM) ===
        # Compute at 1/4 resolution then upsample for performance
        qW, qH = W // 4, H // 4
        qy, qx = np.mgrid[0:qH, 0:qW]
        qxf = qx.astype(np.float32)
        qyf = qy.astype(np.float32)
        freq = 0.015
        # Domain warp
        wx = _value_noise_2d(qxf * freq * 1.3 + t * 0.15, qyf * freq + 3.7)
        wy = _value_noise_2d(qxf * freq + t * 0.1 + 7.2, qyf * freq * 1.1 - 5.3)
        warp_x = qxf + (wx - 0.5) * 80
        warp_y = qyf + (wy - 0.5) * 80
        # Multi-octave noise at warped coords
        val = np.zeros((qH, qW), dtype=np.float32)
        amp = 1.0
        fx, fy = freq * 0.8, freq * 0.7
        for i in range(5):
            val += (
                _value_noise_2d(
                    warp_x * fx + t * 0.08 + i * 11.3, warp_y * fy - t * 0.05 + i * 23.7
                )
                * amp
            )
            amp *= 0.5
            fx *= 2.0
            fy *= 2.0
        val = np.clip(val / 1.9375, 0, 1)
        # Color map: value → hue-varying gradient
        hue = (val * 0.3 + t * 0.02) % 1.0
        sat = np.full_like(val, 0.6)
        bri = val * 0.25
        R, G, B = hsv2rgb(hue.astype(np.float32), sat, bri)
        noise_small = np.stack([R, G, B], axis=2).astype(np.float32)
        # Upsample to full resolution
        noise_layer = np.array(
            Image.fromarray(noise_small.astype(np.uint8)).resize((W, H), Image.BILINEAR)
        ).astype(np.float32)
        canvas += noise_layer

        # === Strange attractor density (cached, recompute every 12 frames) ===
        frame_idx = int(t * 24)
        if self._attr_cache is None or frame_idx - self._attr_cache_frame >= 12:
            a_p = -1.4 + np.sin(t * 0.05) * 0.4
            b_p = 1.6 + np.cos(t * 0.07) * 0.3
            c_p = 1.0 + np.sin(t * 0.03 + 1) * 0.4
            d_p = 0.7 + np.cos(t * 0.04 + 2) * 0.3
            rng = np.random.RandomState(42)
            ax = rng.uniform(-0.1, 0.1, 25000).astype(np.float64)
            ay = rng.uniform(-0.1, 0.1, 25000).astype(np.float64)
            for _ in range(200):
                axn = np.sin(a_p * ay) + c_p * np.cos(a_p * ax)
                ayn = np.sin(b_p * ax) + d_p * np.cos(b_p * ay)
                ax, ay = axn, ayn
            margin = 0.15
            ax_min, ax_max = ax.min() - margin, ax.max() + margin
            ay_min, ay_max = ay.min() - margin, ay.max() + margin
            gx = ((ax - ax_min) / (ax_max - ax_min) * (qW - 1)).astype(np.int32)
            gy = ((ay - ay_min) / (ay_max - ay_min) * (qH - 1)).astype(np.int32)
            valid = (gx >= 0) & (gx < qW) & (gy >= 0) & (gy < qH)
            density = np.zeros((qH, qW), dtype=np.float32)
            np.add.at(density, (gy[valid], gx[valid]), 1.0)
            density = np.log1p(density)
            mx = density.max()
            if mx > 0:
                density /= mx
            attr_r = np.clip(density * 180, 0, 255).astype(np.uint8)
            attr_g = np.clip(density * 120, 0, 255).astype(np.uint8)
            attr_b = np.clip(density * 60, 0, 255).astype(np.uint8)
            attr_small = np.stack([attr_r, attr_g, attr_b], axis=2)
            self._attr_cache = np.array(
                Image.fromarray(attr_small).resize((W, H), Image.BILINEAR)
            ).astype(np.float32)
            self._attr_cache_frame = frame_idx
        canvas += self._attr_cache * 0.25

        # === Flow field particle trails (smooth, anti-aliased) ===
        # Fade existing trails
        self.trail_buf *= 0.965
        # Update particles with curl noise at pixel scale
        noise_sc = 0.003
        eps = 2.0
        n1 = _value_noise_2d(self.px * noise_sc + eps, self.py * noise_sc)
        n2 = _value_noise_2d(self.px * noise_sc - eps, self.py * noise_sc)
        n3 = _value_noise_2d(self.px * noise_sc, self.py * noise_sc + eps)
        n4 = _value_noise_2d(self.px * noise_sc, self.py * noise_sc - eps)
        curl_x = (n3 - n4) * 15
        curl_y = -(n1 - n2) * 15
        # Domain warp
        warp = _value_noise_2d(self.px * 0.002 + t * 0.08, self.py * 0.002 + 3.3)
        curl_x += (warp - 0.5) * 8
        curl_y += (0.5 - warp) * 8
        # Modulate by RD field if provided
        if rd_field is not None:
            rd_h, rd_w = rd_field.shape
            ix = np.clip((self.px / W * rd_w).astype(int), 0, rd_w - 1)
            iy = np.clip((self.py / H * rd_h).astype(int), 0, rd_h - 1)
            rd_val = rd_field[iy, ix]
            curl_x += np.sin(rd_val * np.pi * 6 + t) * 5
            curl_y += np.cos(rd_val * np.pi * 6 + t) * 5
        self.pvx = self.pvx * 0.88 + curl_x * 0.12
        self.pvy = self.pvy * 0.88 + curl_y * 0.12
        # Store prev for line drawing
        prev_x = self.px.copy()
        prev_y = self.py.copy()
        self.px += self.pvx
        self.py += self.pvy
        self.plife -= 0.002
        self.px %= W
        self.py %= H
        # Respawn dead
        dead = self.plife <= 0
        if np.any(dead):
            r2 = np.random.RandomState(int(t * 1000) % 2**31)
            self.px[dead] = r2.uniform(0, W, dead.sum())
            self.py[dead] = r2.uniform(0, H, dead.sum())
            self.plife[dead] = r2.uniform(0.6, 1.0, dead.sum())
        # Draw particle trails — VECTORIZED (no Python loop)
        ix0 = prev_x.astype(np.int32) % W
        iy0 = prev_y.astype(np.int32) % H
        ix1 = self.px.astype(np.int32) % W
        iy1 = self.py.astype(np.int32) % H
        # Skip wrap-around lines
        no_wrap = (np.abs(ix1 - ix0) < W * 0.5) & (np.abs(iy1 - iy0) < H * 0.5)
        # Particle colors (vectorized)
        h_p = (self.plife * 0.3 + t * 0.04) % 1.0
        r_p = 0.5 + 0.5 * np.sin(h_p * 2 * np.pi)
        g_p = 0.5 + 0.5 * np.sin(h_p * 2 * np.pi + 2.1)
        b_p = 0.5 + 0.5 * np.sin(h_p * 2 * np.pi + 4.2)
        bri_p = self.plife * 0.25
        # Plot endpoints only (fast) for all valid particles
        valid = no_wrap & (self.plife > 0)
        vx = ix1[valid]
        vy = iy1[valid]
        vr = r_p[valid] * bri_p[valid]
        vg = g_p[valid] * bri_p[valid]
        vb = b_p[valid] * bri_p[valid]
        np.add.at(self.trail_buf[:, :, 0], (vy, vx), vr)
        np.add.at(self.trail_buf[:, :, 1], (vy, vx), vg)
        np.add.at(self.trail_buf[:, :, 2], (vy, vx), vb)
        np.clip(self.trail_buf, 0, 1, out=self.trail_buf)

        canvas += self.trail_buf * 255 * 0.5

        # === Reaction-diffusion as continuous smooth field ===
        if rd_field is not None:
            rd_img = np.clip(rd_field * 255, 0, 255).astype(np.uint8)
            rd_full = np.array(
                Image.fromarray(rd_img).resize((W, H), Image.BILINEAR)
            ).astype(np.float32)
            # Color: cool blue-purple for the RD field
            rd_canvas = np.zeros((H, W, 3), dtype=np.float32)
            rd_canvas[:, :, 0] = rd_full * 0.15  # low red
            rd_canvas[:, :, 1] = rd_full * 0.08  # very low green
            rd_canvas[:, :, 2] = rd_full * 0.4  # strong blue
            canvas += rd_canvas * 0.3

        return np.clip(canvas, 0, 255).astype(np.uint8)


# ═══════════════════════════════════════════════════════════════════
# FLOW FIELD PARTICLES (p5.js-style, in NumPy)
# ═══════════════════════════════════════════════════════════════════


class FlowParticles:
    """Curl noise flow field particles with persistent trails."""

    def __init__(self, n, rows, cols, seed=42):
        rng = np.random.RandomState(seed)
        self.n = n
        self.rows, self.cols = rows, cols
        self.x = rng.uniform(0, cols, n).astype(np.float32)
        self.y = rng.uniform(0, rows, n).astype(np.float32)
        self.vx = np.zeros(n, dtype=np.float32)
        self.vy = np.zeros(n, dtype=np.float32)
        self.life = rng.uniform(0.5, 1.0, n).astype(np.float32)
        self.trail_buf = np.zeros((rows, cols), dtype=np.float32)

    def step(self, t, flow_field=None, speed=1.5, noise_scale=0.04):
        eps = 0.5
        # Curl noise steering
        n1 = _value_noise_2d(self.x * noise_scale + eps, self.y * noise_scale)
        n2 = _value_noise_2d(self.x * noise_scale - eps, self.y * noise_scale)
        n3 = _value_noise_2d(self.x * noise_scale, self.y * noise_scale + eps)
        n4 = _value_noise_2d(self.x * noise_scale, self.y * noise_scale - eps)
        # Domain warp the noise input with time
        warp = _value_noise_2d(self.x * 0.02 + t * 0.1, self.y * 0.02 + 5.7)
        curl_x = (n3 - n4) * 8 + warp * 2
        curl_y = -(n1 - n2) * 8 + (1 - warp) * 2
        # Apply external flow field modulation if provided
        if flow_field is not None:
            ix = np.clip(self.x.astype(int), 0, self.cols - 1)
            iy = np.clip(self.y.astype(int), 0, self.rows - 1)
            field_val = flow_field[iy, ix]
            curl_x += np.sin(field_val * np.pi * 4 + t) * 3
            curl_y += np.cos(field_val * np.pi * 4 + t) * 3
        self.vx = self.vx * 0.85 + curl_x * speed * 0.15
        self.vy = self.vy * 0.85 + curl_y * speed * 0.15
        self.x += self.vx
        self.y += self.vy
        self.life -= 0.003
        # Wrap edges
        self.x %= self.cols
        self.y %= self.rows
        # Respawn dead particles
        dead = self.life <= 0
        if np.any(dead):
            rng = np.random.RandomState(int(t * 1000) % 2**31)
            self.x[dead] = rng.uniform(0, self.cols, dead.sum())
            self.y[dead] = rng.uniform(0, self.rows, dead.sum())
            self.life[dead] = rng.uniform(0.7, 1.0, dead.sum())
        # Draw to trail buffer with decay
        self.trail_buf *= 0.97  # slow fade
        ix = np.clip(self.x.astype(int), 0, self.cols - 1)
        iy = np.clip(self.y.astype(int), 0, self.rows - 1)
        np.add.at(self.trail_buf, (iy, ix), self.life * 0.3)
        return np.clip(self.trail_buf, 0, 1)


# ═══════════════════════════════════════════════════════════════════
# BLEND MODES
# ═══════════════════════════════════════════════════════════════════

BLEND_MODES = {
    "normal": lambda a, b: b,
    "add": lambda a, b: np.clip(a + b, 0, 1),
    "multiply": lambda a, b: a * b,
    "screen": lambda a, b: 1 - (1 - a) * (1 - b),
    "overlay": lambda a, b: np.where(a < 0.5, 2 * a * b, 1 - 2 * (1 - a) * (1 - b)),
    "difference": lambda a, b: np.abs(a - b),
    "exclusion": lambda a, b: a + b - 2 * a * b,
    "colordodge": lambda a, b: np.clip(a / (1 - b + 1e-6), 0, 1),
    "colorburn": lambda a, b: np.clip(1 - (1 - a) / (b + 1e-6), 0, 1),
    "hardlight": lambda a, b: np.where(b < 0.5, 2 * a * b, 1 - 2 * (1 - a) * (1 - b)),
    "linearlight": lambda a, b: np.clip(a + 2 * b - 1, 0, 1),
    "hard_mix": lambda a, b: np.where(a + b >= 1.0, 1.0, 0.0),
    "lighten": lambda a, b: np.maximum(a, b),
    "darken": lambda a, b: np.minimum(a, b),
}


def blend_canvas(base, top, mode="normal", opacity=1.0):
    af = base.astype(np.float32) / 255.0
    bf = top.astype(np.float32) / 255.0
    fn = BLEND_MODES.get(mode, BLEND_MODES["normal"])
    result = fn(af, bf)
    if opacity < 1.0:
        result = af * (1 - opacity) + result * opacity
    return np.clip(result * 255, 0, 255).astype(np.uint8)


# ═══════════════════════════════════════════════════════════════════
# TONEMAP
# ═══════════════════════════════════════════════════════════════════


def tonemap(canvas, gamma=0.70):
    f = canvas.astype(np.float32)
    sub = f[::4, ::4]
    lo = np.percentile(sub, 1)
    hi = np.percentile(sub, 99.5)
    if hi - lo < 10:
        hi = lo + 10
    f = np.clip((f - lo) / (hi - lo), 0, 1)
    np.power(f, gamma, out=f)
    f *= 245
    f += 5
    return np.clip(f, 0, 255).astype(np.uint8)


# ═══════════════════════════════════════════════════════════════════
# FEEDBACK BUFFER (dual)
# ═══════════════════════════════════════════════════════════════════


class FeedbackBuffer:
    def __init__(self):
        self.buf = None

    def apply(
        self,
        canvas,
        decay=0.85,
        blend="screen",
        opacity=0.5,
        transform=None,
        transform_amt=0.02,
        hue_shift=0.0,
    ):
        if self.buf is None:
            self.buf = canvas.astype(np.float32) / 255.0
            return canvas
        self.buf *= decay
        if transform == "zoom":
            m = max(1, int(self.buf.shape[0] * transform_amt))
            n = max(1, int(self.buf.shape[1] * transform_amt))
            cropped = self.buf[m : -m or None, n : -n or None]
            if cropped.shape[0] > 0 and cropped.shape[1] > 0:
                self.buf = (
                    np.array(
                        Image.fromarray(
                            np.clip(cropped * 255, 0, 255).astype(np.uint8)
                        ).resize((self.buf.shape[1], self.buf.shape[0]), Image.NEAREST)
                    ).astype(np.float32)
                    / 255.0
                )
        elif transform == "rotate_cw":
            h, w = self.buf.shape[:2]
            cy, cx = h / 2, w / 2
            Y = np.arange(h, dtype=np.float32)[:, None]
            X = np.arange(w, dtype=np.float32)[None, :]
            angle = transform_amt * 10
            cos_a, sin_a = np.cos(angle), np.sin(angle)
            sx = np.clip(
                ((X - cx) * cos_a + (Y - cy) * sin_a + cx).astype(int), 0, w - 1
            )
            sy = np.clip(
                (-(X - cx) * sin_a + (Y - cy) * cos_a + cy).astype(int), 0, h - 1
            )
            self.buf = self.buf[sy, sx]
        elif transform == "shift_up":
            px = max(1, int(self.buf.shape[0] * transform_amt))
            self.buf = np.roll(self.buf, -px, axis=0)
            self.buf[-px:] = 0
        if hue_shift > 0:
            self.buf = self._hue_shift_buf(self.buf, hue_shift)
        fb_uint8 = np.clip(self.buf * 255, 0, 255).astype(np.uint8)
        result = blend_canvas(canvas, fb_uint8, blend, opacity)
        self.buf = result.astype(np.float32) / 255.0
        return result

    def _hue_shift_buf(self, buf, amount):
        r, g, b = buf[:, :, 0], buf[:, :, 1], buf[:, :, 2]
        mx = np.maximum(np.maximum(r, g), b)
        mn = np.minimum(np.minimum(r, g), b)
        delta = mx - mn + 1e-10
        h = np.where(
            mx == r,
            ((g - b) / delta) % 6,
            np.where(mx == g, (b - r) / delta + 2, (r - g) / delta + 4),
        )
        h = (h / 6 + amount) % 1.0
        s = delta / (mx + 1e-10)
        v = mx
        c = v * s
        x = c * (1 - np.abs((h * 6) % 2 - 1))
        m = v - c
        ro = np.zeros_like(h)
        go = np.zeros_like(h)
        bo = np.zeros_like(h)
        for lo_v, hi_v, rv, gv, bv in [
            (0, 1, c, x, 0),
            (1, 2, x, c, 0),
            (2, 3, 0, c, x),
            (3, 4, 0, x, c),
            (4, 5, x, 0, c),
            (5, 6, c, 0, x),
        ]:
            mask = ((h * 6) >= lo_v) & ((h * 6) < hi_v)
            if isinstance(rv, (int, float)):
                ro[mask] = rv
            else:
                ro[mask] = rv[mask]
            if isinstance(gv, (int, float)):
                go[mask] = gv
            else:
                go[mask] = gv[mask]
            if isinstance(bv, (int, float)):
                bo[mask] = bv
            else:
                bo[mask] = bv[mask]
        return np.stack([ro + m, go + m, bo + m], axis=2)


# ═══════════════════════════════════════════════════════════════════
# SHADER CHAIN
# ═══════════════════════════════════════════════════════════════════

_crt_cache = {}


def sh_crt(c, strength=0.05):
    k = (c.shape[0], c.shape[1], round(strength, 3))
    if k not in _crt_cache:
        h, w = c.shape[:2]
        cy, cx = h / 2, w / 2
        Y = np.arange(h, dtype=np.float32)[:, None]
        X = np.arange(w, dtype=np.float32)[None, :]
        ny = (Y - cy) / cy
        nx = (X - cx) / cx
        r2 = nx**2 + ny**2
        factor = 1 + strength * r2
        _crt_cache[k] = (
            np.clip((ny * factor * cy + cy).astype(np.int32), 0, h - 1),
            np.clip((nx * factor * cx + cx).astype(np.int32), 0, w - 1),
        )
    sy, sx = _crt_cache[k]
    return c[sy, sx]


def sh_bloom(c, thr=130):
    sm = c[::4, ::4].astype(np.float32)
    br = np.where(sm > thr, sm, 0)
    for _ in range(3):
        p = np.pad(br, ((1, 1), (1, 1), (0, 0)), mode="edge")
        br = (
            p[:-2, :-2]
            + p[:-2, 1:-1]
            + p[:-2, 2:]
            + p[1:-1, :-2]
            + p[1:-1, 1:-1]
            + p[1:-1, 2:]
            + p[2:, :-2]
            + p[2:, 1:-1]
            + p[2:, 2:]
        ) / 9.0
    bl = np.repeat(np.repeat(br, 4, axis=0), 4, axis=1)[: c.shape[0], : c.shape[1]]
    return np.clip(c.astype(np.float32) + bl * 0.6, 0, 255).astype(np.uint8)


def sh_chromatic(c, amt=3):
    if amt < 1:
        return c
    a = int(amt)
    o = c.copy()
    o[:, a:, 0] = c[:, :-a, 0]
    o[:, :-a, 2] = c[:, a:, 2]
    return o


def sh_scanlines(c, intensity=0.06, spacing=3):
    m = np.ones(c.shape[0], dtype=np.float32)
    m[::spacing] = 1.0 - intensity
    return np.clip(c * m[:, None, None], 0, 255).astype(np.uint8)


_vig_cache = {}


def sh_vignette(c, s=0.22):
    k = (c.shape[0], c.shape[1], round(s, 2))
    if k not in _vig_cache:
        h, w = c.shape[:2]
        Y = np.linspace(-1, 1, h)[:, None]
        X = np.linspace(-1, 1, w)[None, :]
        _vig_cache[k] = np.clip(1.0 - np.sqrt(X**2 + Y**2) * s, 0.12, 1).astype(
            np.float32
        )
    return np.clip(c * _vig_cache[k][:, :, None], 0, 255).astype(np.uint8)


def sh_grain(c, amt=10):
    noise = np.random.randint(
        -amt, amt + 1, (c.shape[0] // 2, c.shape[1] // 2, 1), dtype=np.int16
    )
    noise = np.repeat(np.repeat(noise, 2, axis=0), 2, axis=1)[
        : c.shape[0], : c.shape[1]
    ]
    return np.clip(c.astype(np.int16) + noise, 0, 255).astype(np.uint8)


def sh_color_wobble(c, t, amt=0.3):
    o = c.astype(np.float32)
    o[:, :, 0] *= 1.0 + amt * math.sin(t * 5.0)
    o[:, :, 1] *= 1.0 + amt * math.sin(t * 5.0 + 2.09)
    o[:, :, 2] *= 1.0 + amt * math.sin(t * 5.0 + 4.19)
    return np.clip(o, 0, 255).astype(np.uint8)


def sh_solarize(c, threshold=128):
    o = c.copy()
    mask = c > threshold
    o[mask] = 255 - c[mask]
    return o


def sh_kaleidoscope(c, folds=6):
    h, w = c.shape[:2]
    cy, cx = h // 2, w // 2
    Y = np.arange(h, dtype=np.float32)[:, None] - cy
    X = np.arange(w, dtype=np.float32)[None, :] - cx
    angle = np.arctan2(Y, X)
    dist = np.sqrt(X**2 + Y**2)
    wedge = 2 * np.pi / folds
    folded = np.abs((angle % wedge) - wedge / 2)
    ny = np.clip((cy + dist * np.sin(folded)).astype(int), 0, h - 1)
    nx = np.clip((cx + dist * np.cos(folded)).astype(int), 0, w - 1)
    return c[ny, nx]


def sh_pixel_sort(c, threshold=100):
    gray = c.astype(np.float32).mean(axis=2)
    out = c.copy()
    step = max(3, c.shape[0] // 200)
    for y in range(0, c.shape[0], step):
        row_bright = gray[y]
        mask = row_bright > threshold
        regions = np.diff(np.concatenate([[0], mask.astype(int), [0]]))
        starts = np.where(regions == 1)[0]
        ends = np.where(regions == -1)[0]
        for s, e in zip(starts, ends):
            if e - s > 3:
                indices = np.argsort(gray[y, s:e])
                out[y, s:e] = c[y, s:e][indices]
    return out


def sh_glitch_bands(c, intensity=0.5):
    n = int(3 + intensity * 12)
    out = c.copy()
    for _ in range(n):
        y = random.randint(0, c.shape[0] - 1)
        h = random.randint(1, max(2, int(4 + intensity * 15)))
        shift = int((random.random() - 0.5) * intensity * 80)
        if shift != 0 and y + h < c.shape[0]:
            out[y : y + h] = np.roll(out[y : y + h], shift, axis=1)
    return out


def sh_hue_rotate(c, amount=0.1):
    h, s, v = rgb2hsv_canvas(c)
    h = (h + amount) % 1.0
    R, G, B = hsv2rgb(h, s, v)
    return mkc(R, G, B, c.shape[0], c.shape[1])


class ShaderChain:
    def __init__(self):
        self.steps = []

    def add(self, name, **kwargs):
        self.steps.append((name, kwargs))
        return self

    def apply(self, canvas, t=0, intensity=1.0):
        for name, kw in self.steps:
            canvas = self._dispatch(canvas, name, kw, t, intensity)
        return canvas

    def _dispatch(self, c, name, kw, t, intensity):
        if name == "bloom":
            return sh_bloom(c, kw.get("thr", 130))
        elif name == "chromatic":
            return sh_chromatic(c, max(1, int(kw.get("amt", 4) * intensity)))
        elif name == "scanlines":
            return sh_scanlines(c, kw.get("intensity", 0.06), kw.get("spacing", 3))
        elif name == "vignette":
            return sh_vignette(c, kw.get("s", 0.22))
        elif name == "grain":
            return sh_grain(c, int(kw.get("amt", 10) * intensity))
        elif name == "color_wobble":
            return sh_color_wobble(c, t, kw.get("amt", 0.2) * intensity)
        elif name == "solarize":
            return sh_solarize(c, kw.get("threshold", 128))
        elif name == "kaleidoscope":
            return sh_kaleidoscope(c.copy(), kw.get("folds", 6))
        elif name == "pixel_sort":
            return sh_pixel_sort(c, kw.get("threshold", 100))
        elif name == "glitch_bands":
            return sh_glitch_bands(c, kw.get("intensity", 0.5) * intensity)
        elif name == "crt":
            return sh_crt(c, kw.get("strength", 0.04))
        elif name == "hue_rotate":
            return sh_hue_rotate(c, kw.get("amount", 0.1))
        return c


# ═══════════════════════════════════════════════════════════════════
# HUE FIELD GENERATORS
# ═══════════════════════════════════════════════════════════════════


def hf_time_cycle(rate=0.08):
    def fn(g, t):
        return np.full((g.rows, g.cols), (t * rate) % 1.0, dtype=np.float32)

    return fn


def hf_angle(offset=0.0):
    def fn(g, t):
        return ((g.angle / (2 * np.pi) + 0.5 + offset + t * 0.02) % 1.0).astype(
            np.float32
        )

    return fn


def hf_distance(center_hue=0.6, spread=0.03):
    def fn(g, t):
        return (center_hue + g.dist_n * spread + t * 0.01).astype(np.float32) % 1.0

    return fn


def hf_attractor(t):
    """Hue derived from attractor x-coordinate."""
    a = -1.4 + np.sin(t * 0.05) * 0.4
    b = 1.6 + np.cos(t * 0.07) * 0.3
    x, y = 0.1, 0.1
    for _ in range(50):
        xn = np.sin(a * y) + 1.0 * np.cos(a * x)
        yn = np.sin(b * x) + 0.7 * np.cos(b * y)
        x, y = xn, yn
    return (x * 0.15 + 0.5) % 1.0


# ═══════════════════════════════════════════════════════════════════
# RENDER HELPER
# ═══════════════════════════════════════════════════════════════════


def render_vf(grid, val_fn_result, hue_fn_result, pal, sat=0.8, threshold=0.03):
    """Render value field + hue to pixel canvas."""
    val = np.clip(val_fn_result, 0, 1)
    mask = val > threshold
    ch = val2char(val, mask, pal)
    h = np.broadcast_to(hue_fn_result, (grid.rows, grid.cols)).copy() % 1.0
    R, G, B = hsv2rgb(h, np.full_like(val, sat), val)
    co = mkc(R, G, B, grid.rows, grid.cols)
    return grid.render(ch, co)


# ═══════════════════════════════════════════════════════════════════
# SYNTHETIC FEATURES
# ═══════════════════════════════════════════════════════════════════


def synthetic_features(t, rd_energy=0.3):
    """Generate audio-like features from time and system state."""
    return {
        "rms": 0.3 + rd_energy * 0.4 + np.sin(t * 1.1) * 0.1,
        "bass": np.sin(t * 0.3) * 0.5 + 0.5,
        "mid": np.sin(t * 1.7 + 1.2) * 0.4 + 0.5,
        "hi": np.sin(t * 4.3 + 2.8) * 0.3 + 0.5,
        "bdecay": max(0, np.sin(t * 2.1) ** 12),
        "beat": 1 if np.sin(t * 2.1) > 0.985 else 0,
        "chaos": np.sin(t * 0.17) * 0.5 + 0.5,  # slow chaos ramp
    }


# ═══════════════════════════════════════════════════════════════════
# MASTER COMPOSITOR
# ═══════════════════════════════════════════════════════════════════


class MorphogenesisRenderer:
    def __init__(self, W, H, fps, duration, font_path):
        self.W, self.H = W, H
        self.fps = fps
        self.duration = duration
        self.total_frames = int(fps * duration)

        print(f"  Resolution: {W}x{H}")
        print(f"  Duration: {duration}s @ {fps}fps = {self.total_frames} frames")

        # Grid system
        print("  Initializing grids...")
        self.gs = GridSystem(W, H, font_path)
        for key, grid in self.gs.grids.items():
            print(
                f"    {key}: {grid.cols}x{grid.rows} chars ({grid.cw}x{grid.ch}px cells)"
            )

        # Initialize organisms
        g_md = self.gs.get("md")
        g_sm = self.gs.get("sm")

        print("  Initializing reaction-diffusion...")
        self.rd = ReactionDiffusion(g_md.rows, g_md.cols)
        # Warm up RD a bit
        for _ in range(30):
            self.rd.step(steps=8)

        print("  Initializing cellular automata...")
        self.ca = CellularAutomata(g_md.rows, g_md.cols, density=0.2, rule="day_night")

        print("  Initializing flow particles...")
        self.particles = FlowParticles(2000, g_sm.rows, g_sm.cols)

        # === NEW: Pixel-based layers (non-ASCII) ===
        print("  Initializing Manim pixel layer (smooth geometry)...")
        self.manim_layer = ManimPixelLayer(W, H, font_path)

        print("  Initializing p5.js pixel layer (continuous fields)...")
        self.p5js_layer = P5jsPixelLayer(W, H)

        # Feedback buffers (dual!)
        self.fb_zoom = FeedbackBuffer()
        self.fb_rotate = FeedbackBuffer()

        # Shader chain
        self.chain = ShaderChain()
        self.chain.add("bloom", thr=100)
        self.chain.add("chromatic", amt=5)
        self.chain.add("scanlines", intensity=0.04, spacing=4)
        self.chain.add("vignette", s=0.35)
        self.chain.add("grain", amt=12)

    def render_frame(self, frame_idx):
        """Render a single frame. Returns uint8 (H, W, 3).

        Three visually distinct vocabularies composited together:
        1. ASCII character textures (grid-based, pixelated characters)
        2. Manim smooth geometry (anti-aliased lines, curves, equations)
        3. p5.js continuous fields (gradients, particle trails, attractor density)
        """
        t = frame_idx / self.fps

        g_sm = self.gs.get("sm")
        g_md = self.gs.get("md")
        g_lg = self.gs.get("lg")

        # === Synthetic features ===
        rd_energy = np.mean(self.rd.B)
        f = synthetic_features(t, rd_energy)
        chaos = f["chaos"]

        # ╔═══════════════════════════════════════════════════════╗
        # ║  VOCABULARY 1: ASCII CHARACTER LAYERS                ║
        # ║  Grid-snapped, pixelated character textures          ║
        # ╚═══════════════════════════════════════════════════════╝

        # Reaction-Diffusion
        rd_feed, rd_kill = self.rd.get_lissajous_params(t, self.duration)
        rd_field = self.rd.step(steps=4, feed=rd_feed, kill=rd_kill)
        rd_val = rd_field[: g_md.rows, : g_md.cols]

        # Cellular Automata
        ca_val = self.ca.step(inject_noise=(f["beat"] > 0))

        # Value fields for ASCII layers
        warp_val = vf_domain_warp(
            g_sm, t, freq=0.04 + chaos * 0.03, strength=10 + chaos * 15
        )
        voronoi_val = vf_voronoi(g_md, t, n_cells=12 + int(chaos * 8))
        tunnel_val = vf_tunnel(
            g_lg, t, speed=2.0 + chaos * 3, complexity=4 + int(chaos * 4)
        )

        # Hue fields
        base_hue = hf_attractor(t)
        hue_md = (hf_angle(base_hue)(g_md, t)).astype(np.float32) % 1.0
        hue_sm = hf_time_cycle(0.06)(g_sm, t)
        hue_lg = hf_distance(base_hue, 0.04)(g_lg, t)

        # ASCII Layer A: fine braille texture
        ascii_a = render_vf(g_sm, warp_val, hue_sm, PAL_BRAILLE, sat=0.65)

        # ASCII Layer B: medium rune/RD texture
        combined_md = np.maximum(rd_val * 0.8, voronoi_val * 0.5)
        combined_md = np.maximum(combined_md, ca_val * 0.4)
        ascii_b = render_vf(g_md, combined_md, hue_md, PAL_RUNE, sat=0.75)

        # ASCII Layer C: coarse block tunnel
        ascii_c = render_vf(g_lg, tunnel_val * 0.7, hue_lg, PAL_BLOCKS, sat=0.85)

        # Compose ASCII layers
        ascii_composite = blend_canvas(ascii_a, ascii_b, "screen", 0.7)
        ascii_composite = blend_canvas(ascii_composite, ascii_c, "screen", 0.5)

        # ╔═══════════════════════════════════════════════════════╗
        # ║  VOCABULARY 2: MANIM SMOOTH GEOMETRY                 ║
        # ║  Anti-aliased vector lines, parametric curves, text  ║
        # ╚═══════════════════════════════════════════════════════╝

        manim_canvas = self.manim_layer.render(t)

        # ╔═══════════════════════════════════════════════════════╗
        # ║  VOCABULARY 3: P5.JS CONTINUOUS FIELDS               ║
        # ║  Smooth gradients, particle trails, attractor density ║
        # ╚═══════════════════════════════════════════════════════╝

        p5js_canvas = self.p5js_layer.render(t, rd_field=rd_field)

        # ╔═══════════════════════════════════════════════════════╗
        # ║  MASTER COMPOSITION — blend three vocabularies       ║
        # ╚═══════════════════════════════════════════════════════╝

        # Start with p5.js continuous fields as a dark base (smooth backdrop)
        result = p5js_canvas

        # Screen-blend the ASCII layers on top (characters overlay the gradients)
        result = blend_canvas(result, ascii_composite, "screen", 0.55)

        # Add Manim geometry via screen blend (bright lines glow over everything)
        result = blend_canvas(result, manim_canvas, "screen", 0.70 + chaos * 0.12)

        # Difference blend a second ASCII layer for psychedelic interference
        result = blend_canvas(result, ascii_c, "difference", 0.20 + chaos * 0.10)

        # === AGGRESSIVE CHAOS MODULATIONS ===

        # Periodic kaleidoscope bursts
        kali_intensity = max(0, np.sin(t * 0.37) ** 6)
        if kali_intensity > 0.3:
            folds = 4 + int(np.sin(t * 0.5) * 2 + 2)
            result = sh_kaleidoscope(result.copy(), folds=folds)

        # Pixel sort
        sort_intensity = max(0, np.sin(t * 0.19 + 1.3))
        if sort_intensity > 0.4:
            result = sh_pixel_sort(result, threshold=80 + int(np.sin(t * 0.23) * 60))

        # Solarize pulses
        solar_pulse = max(0, np.sin(t * 0.31 + 2.1) ** 8)
        if solar_pulse > 0.3:
            result = sh_solarize(result, threshold=100 + int(np.sin(t * 0.7) * 50))

        # Glitch bands on synthetic beats
        if f["bdecay"] > 0.2:
            result = sh_glitch_bands(result, intensity=f["bdecay"] * 1.5)

        # === DUAL FEEDBACK ===
        result = self.fb_zoom.apply(
            result,
            decay=0.76 + chaos * 0.08,
            blend="screen",
            opacity=0.22 + chaos * 0.10,
            transform="zoom",
            transform_amt=0.008 + chaos * 0.006,
            hue_shift=0.015 + chaos * 0.01,
        )

        result = self.fb_rotate.apply(
            result,
            decay=0.65,
            blend="exclusion",
            opacity=0.15 + chaos * 0.08,
            transform="rotate_cw",
            transform_amt=0.003,
            hue_shift=0.008,
        )

        # === TONEMAP ===
        result = tonemap(result, gamma=0.78 + solar_pulse * 0.08)

        # === SHADER CHAIN ===
        intensity = 0.7 + chaos * 0.5 + f["bdecay"] * 0.3
        result = self.chain.apply(result, t=t, intensity=min(intensity, 1.5))

        # Color wobble
        result = sh_color_wobble(result, t, amt=0.10 + chaos * 0.06)

        return result

    def render_video(self, output_path, crf=20):
        """Render full video to file."""
        cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-s",
            f"{self.W}x{self.H}",
            "-r",
            str(self.fps),
            "-i",
            "pipe:0",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            str(crf),
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            output_path,
        ]
        log_path = output_path + ".ffmpeg.log"
        log_file = open(log_path, "w")
        proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stderr=log_file, bufsize=10**8
        )

        t0 = time.time()
        for frame_idx in range(self.total_frames):
            canvas = self.render_frame(frame_idx)
            proc.stdin.write(canvas.tobytes())

            # Progress
            elapsed = time.time() - t0
            fps_actual = (frame_idx + 1) / max(elapsed, 0.001)
            eta = (self.total_frames - frame_idx - 1) / max(fps_actual, 0.01)
            t_sec = frame_idx / self.fps
            if frame_idx % 10 == 0 or frame_idx == self.total_frames - 1:
                print(
                    f"\r  Frame {frame_idx + 1}/{self.total_frames} "
                    f"({t_sec:.1f}s) | {fps_actual:.1f} fps | "
                    f"ETA {eta:.0f}s",
                    end="",
                    flush=True,
                )

        proc.stdin.close()
        proc.wait()
        log_file.close()
        print(f"\n  Done! {output_path} ({time.time() - t0:.0f}s total)")

    def render_test_frame(self, frame_idx, output_path):
        """Render a single frame as PNG for preview."""
        canvas = self.render_frame(frame_idx)
        Image.fromarray(canvas).save(output_path)
        print(f"  Test frame {frame_idx} saved to {output_path}")


# ═══════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════


def find_font():
    for p in FONT_PATHS:
        if os.path.exists(p):
            return p
    raise RuntimeError(
        "No monospace font found. Install Menlo, Monaco, or DejaVu Sans Mono."
    )


def main():
    parser = argparse.ArgumentParser(
        description="Morphogenesis — experimental animation"
    )
    parser.add_argument(
        "--quality", default="preview", choices=["preview", "medium", "high"]
    )
    parser.add_argument(
        "--test-frame",
        type=int,
        default=None,
        help="Render a single frame index as PNG",
    )
    parser.add_argument("--output", default=None, help="Output file path")
    args = parser.parse_args()

    q = QUALITY[args.quality]
    font_path = find_font()

    print(f"\n{'=' * 60}")
    print(f"  MORPHOGENESIS — {args.quality.upper()}")
    print(f"{'=' * 60}")
    print(f"  Font: {font_path}")

    project_dir = Path(__file__).parent
    if args.output:
        output = args.output
    else:
        output = str(project_dir / f"morphogenesis_{args.quality}.mp4")

    renderer = MorphogenesisRenderer(
        W=q["W"], H=q["H"], fps=q["fps"], duration=q["duration"], font_path=font_path
    )

    if args.test_frame is not None:
        png_path = str(project_dir / f"test_frame_{args.test_frame}.png")
        renderer.render_test_frame(args.test_frame, png_path)
    else:
        renderer.render_video(output, crf=q["crf"])


if __name__ == "__main__":
    main()
