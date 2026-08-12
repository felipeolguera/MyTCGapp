#!/usr/bin/env python3
"""Regenerate Android + web icons from branding/archive-binder-logo.png."""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "branding" / "archive-binder-logo.png"
BG = (10, 15, 21, 255)


def extract_mark(im: Image.Image) -> Image.Image:
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    px, op = im.load(), out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _a = px[x, y]
            total = r + g + b
            if total > 90:
                op[x, y] = (r, g, b, 255)
            elif total > 55:
                op[x, y] = (r, g, b, min(255, int((total - 55) * 6)))
    return out


def content_bbox(im: Image.Image, alpha_thresh: int = 20):
    px = im.load()
    xs, ys = [], []
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3] > alpha_thresh:
                xs.append(x)
                ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


def fit_on_canvas(mark: Image.Image, size: int, pad_ratio: float = 0.18) -> Image.Image:
    cropped = mark.crop(content_bbox(mark))
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    max_side = int(size * (1 - 2 * pad_ratio))
    scale = min(max_side / cropped.width, max_side / cropped.height)
    nw = max(1, int(cropped.width * scale))
    nh = max(1, int(cropped.height * scale))
    resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.alpha_composite(resized, ((size - nw) // 2, (size - nh) // 2))
    return canvas


def opaque_icon(mark: Image.Image, size: int) -> Image.Image:
    layer = fit_on_canvas(mark, size, pad_ratio=0.16)
    base = Image.new("RGBA", (size, size), BG)
    base.alpha_composite(layer)
    return base


def round_icon(mark: Image.Image, size: int) -> Image.Image:
    icon = opaque_icon(mark, size)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(icon, (0, 0), mask)
    return out


def splash(mark: Image.Image, w: int, h: int) -> Image.Image:
    logo_size = int(min(w, h) * 0.42)
    layer = fit_on_canvas(mark, logo_size, pad_ratio=0.08)
    rgba = Image.new("RGBA", (w, h), (*BG[:3], 255))
    rgba.alpha_composite(layer, ((w - logo_size) // 2, (h - logo_size) // 2))
    return rgba.convert("RGB")


def main() -> None:
    mark = extract_mark(Image.open(SRC).convert("RGBA"))
    (ROOT / "branding" / "archive-binder-mark.png").parent.mkdir(exist_ok=True)
    mark.save(ROOT / "branding" / "archive-binder-mark.png")

    res = ROOT / "client" / "android" / "app" / "src" / "main" / "res"
    densities = {
        "mdpi": (48, 108),
        "hdpi": (72, 162),
        "xhdpi": (96, 216),
        "xxhdpi": (144, 324),
        "xxxhdpi": (192, 432),
    }
    for name, (size, fg) in densities.items():
        d = res / f"mipmap-{name}"
        d.mkdir(exist_ok=True)
        opaque_icon(mark, size).save(d / "ic_launcher.png", optimize=True)
        round_icon(mark, size).save(d / "ic_launcher_round.png", optimize=True)
        fit_on_canvas(mark, fg, pad_ratio=0.20).save(
            d / "ic_launcher_foreground.png", optimize=True
        )

    for rel, w, h in [
        ("drawable/splash.png", 480, 320),
        ("drawable-port-mdpi/splash.png", 320, 480),
        ("drawable-port-hdpi/splash.png", 480, 800),
        ("drawable-port-xhdpi/splash.png", 720, 1280),
        ("drawable-port-xxhdpi/splash.png", 960, 1600),
        ("drawable-port-xxxhdpi/splash.png", 1280, 1920),
        ("drawable-land-mdpi/splash.png", 480, 320),
        ("drawable-land-hdpi/splash.png", 800, 480),
        ("drawable-land-xhdpi/splash.png", 1280, 720),
        ("drawable-land-xxhdpi/splash.png", 1600, 960),
        ("drawable-land-xxxhdpi/splash.png", 1920, 1280),
    ]:
        path = res / rel
        path.parent.mkdir(exist_ok=True)
        splash(mark, w, h).save(path, optimize=True)

    pub = ROOT / "client" / "public" / "icons"
    pub.mkdir(parents=True, exist_ok=True)
    for size in (32, 48, 64, 128, 180, 192, 256, 512):
        opaque_icon(mark, size).save(pub / f"icon-{size}.png", optimize=True)
    opaque_icon(mark, 32).save(ROOT / "client" / "public" / "favicon.png", optimize=True)
    opaque_icon(mark, 180).save(pub / "apple-touch-icon.png", optimize=True)
    fit_on_canvas(mark, 128, pad_ratio=0.06).save(pub / "brand-mark.png", optimize=True)
    print("Icons regenerated from", SRC)


if __name__ == "__main__":
    main()
