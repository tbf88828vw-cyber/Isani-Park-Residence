#!/usr/bin/env python3
"""Prepare web media for the Isani Park Residence site from the developer's source folder.

Usage: python3 tools/media.py <source-folder> [--only images|plans|video]
Outputs go to public/assets/. Re-running overwrites outputs.
"""
import io, json, os, re, shutil, subprocess, sys
from PIL import Image, ImageCms, ImageFilter

SRC = sys.argv[1]
ONLY = sys.argv[3] if len(sys.argv) > 3 and sys.argv[2] == "--only" else None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets")
SRGB = ImageCms.createProfile("sRGB")


def load_rgb(path):
    im = Image.open(path)
    if im.mode == "CMYK":
        icc = im.info.get("icc_profile")
        if icc:
            src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            im = ImageCms.profileToProfile(im, src, SRGB, outputMode="RGB",
                                           renderingIntent=ImageCms.Intent.PERCEPTUAL)
        else:
            im = im.convert("RGB")
    elif im.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        im = im.convert("RGBA")
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    return im


def save_set(im, base, widths, q_webp=78, q_avif=55, avif=True):
    """Save responsive webp (+avif) variants. Returns list of (w,h)."""
    os.makedirs(os.path.dirname(base), exist_ok=True)
    sizes = []
    for w in widths:
        if w > im.width:
            w = im.width
        h = round(im.height * w / im.width)
        r = im.resize((w, h), Image.LANCZOS)
        r.save(f"{base}-{w}.webp", "WEBP", quality=q_webp, method=6)
        if avif:
            r.save(f"{base}-{w}.avif", "AVIF", quality=q_avif, speed=6)
        sizes.append((w, h))
    return sizes


manifest = {}

# ---------- exterior renders (visualisations) ----------
GALLERY = [
    # id, source, focal description key
    ("front", "ექსტერიერის რენდერები/მერიის რენდერები/02.png"),
    ("corner-west", "ექსტერიერის რენდერები/მერიის რენდერები/01.png"),
    ("park-facade", "ექსტერიერის რენდერები/3.png"),
    ("aerial-courtyard", "ექსტერიერის რენდერები/11.png"),
    ("aerial-paths", "ექსტერიერის რენდერები/10.png"),
    ("corner-tower", "ექსტერიერის რენდერები/1.png"),
    ("garden-walk", "ექსტერიერის რენდერები/5.png"),
    ("evening-light", "ექსტერიერის რენდერები/8.png"),
    ("street-view", "ექსტერიერის რენდერები/9.png"),
    ("garden-front", "ექსტერიერის რენდერები/მერიის რენდერები/03.jpg"),
    ("portrait-corner", "ექსტერიერის რენდერები/7.png"),
    ("east-facade", "ექსტერიერის რენდერები/მერიის რენდერები/06.jpg"),
]

if ONLY in (None, "images"):
    gal = []
    for gid, rel in GALLERY:
        im = load_rgb(os.path.join(SRC, rel))
        sizes = save_set(im, os.path.join(OUT, "img", "gallery", gid), [640, 1280, 2000])
        gal.append({"id": gid, "w": im.width, "h": im.height, "sizes": [s[0] for s in sizes]})
        print("gallery", gid, im.size)
    manifest["gallery"] = gal

    # apartment layout visualisations (with areas) — CMYK JPEGs converted to sRGB
    lay = []
    ldir = os.path.join(SRC, "ბინის აქსონომეტრული რენდერები ფართებით")
    for fn in sorted(os.listdir(ldir)):
        m = re.search(r"- ([\d.]+)(?: მ2)?_(\d)", fn)
        if not m:
            continue
        area, rooms = float(m.group(1)), int(m.group(2))
        im = load_rgb(os.path.join(ldir, fn))
        # keep only the 3D view: drop the text column, logo and QR code of the sales card
        im = im.crop((int(im.width*0.345), int(im.height*0.02), int(im.width*0.985), int(im.height*0.83)))
        lid = f"layout-{str(area).replace('.', '-')}"
        save_set(im, os.path.join(OUT, "img", "layouts", lid), [600, 1200], avif=False)
        lay.append({"id": lid, "area": area, "rooms": rooms, "w": im.width, "h": im.height})
        print("layout", lid, rooms)
    manifest["layouts"] = sorted(lay, key=lambda x: x["area"])

    # floor top-view renders
    fl = []
    for fid, rel in [("floor-1", "-2-10 სართულის რენდერი ზედხედში/1 სართული.png"),
                     ("floor-typical", "-2-10 სართულის რენდერი ზედხედში/2-10 სართული(ტიპიური).png")]:
        im = load_rgb(os.path.join(SRC, rel))
        # trim uniform white margins
        bbox = Image.eval(im.convert("L"), lambda p: 255 if p < 245 else 0).getbbox()
        if bbox:
            pad = 40
            im = im.crop((max(0, bbox[0]-pad), max(0, bbox[1]-pad), min(im.width, bbox[2]+pad), min(im.height, bbox[3]+pad)))
        save_set(im, os.path.join(OUT, "img", "floors", fid), [1200, 2400], avif=False, q_webp=82)
        fl.append({"id": fid, "w": im.width, "h": im.height})
        print("floor", fid, im.size)
    manifest["floors"] = fl

    # Open Graph image 1200x630 from the front render
    im = load_rgb(os.path.join(SRC, GALLERY[1][1]))
    tw, th = 1200, 630
    scale = max(tw / im.width, th / im.height)
    r = im.resize((round(im.width*scale), round(im.height*scale)), Image.LANCZOS)
    left = (r.width - tw)//2; top = (r.height - th)//2
    r.crop((left, top, left+tw, top+th)).save(os.path.join(OUT, "img", "og-image.jpg"), "JPEG", quality=84, optimize=True, progressive=True)

# ---------- apartment plans ----------
if ONLY in (None, "plans"):
    apts = json.load(open(os.path.join(ROOT, "src", "data", "apartments.source.json")))
    for a in apts:
        if not a.get("pdf"):
            continue
        n = a["id"]
        tmp = f"/tmp/plan-{n}"
        subprocess.run(["pdftoppm", "-r", "170", "-png", "-singlefile", os.path.join(SRC, a["pdf"]), tmp], check=True)
        im = Image.open(tmp + ".png").convert("RGB")
        W, H = im.size
        # the beige plan panel starts under the header; find panel by colour (approx #f3efe6)
        px = im.load()
        def is_panel(c):
            return abs(c[0]-243) < 10 and abs(c[1]-239) < 10 and abs(c[2]-230) < 12
        top = next(y for y in range(int(H*0.08), H) if is_panel(px[W//2, y]))
        bottom = next(y for y in range(H-1, top, -1) if is_panel(px[W//2, y]))
        left = next(x for x in range(0, W) if is_panel(px[x, (top+bottom)//2]))
        right = next(x for x in range(W-1, 0, -1) if is_panel(px[x, (top+bottom)//2]))
        crop = im.crop((left, top, right+1, bottom+1))
        base = os.path.join(OUT, "plans", "img", f"apt-{n}")
        crop.resize((1000, round(crop.height*1000/crop.width)), Image.LANCZOS).save(base + "-1000.webp", "WEBP", quality=80, method=6)
        crop.resize((440, round(crop.height*440/crop.width)), Image.LANCZOS).save(base + "-440.webp", "WEBP", quality=74, method=6)
        shutil.copyfile(os.path.join(SRC, a["pdf"]), os.path.join(OUT, "plans", "pdf", f"isani-park-residence-E-apartment-{n}.pdf"))
        os.remove(tmp + ".png")
        a["planRatio"] = round(crop.height / crop.width, 4)
    json.dump(apts, open(os.path.join(ROOT, "src", "data", "apartments.source.json"), "w"), ensure_ascii=False, indent=1)
    print("plans done")

# ---------- hero video ----------
if ONLY in (None, "video"):
    vsrc = os.path.join(SRC, "ექსტერიერის ვიდეო ანიმაცია", "02.mp4")
    vdir = os.path.join(OUT, "video")
    # seamless loop: crossfade the last second into the first
    common = ["-an", "-movflags", "+faststart", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-profile:v", "high", "-preset", "slow"]
    loop = ("[0:v]trim=0:14,setpts=PTS-STARTPTS[a];[0:v]trim=0:1,setpts=PTS-STARTPTS[b];"
            "[a][b]xfade=transition=fade:duration=1:offset=13[v]")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", vsrc, "-filter_complex",
                    loop + ";[v]fps=24,scale=1280:720,gblur=sigma=5.5[o]", "-map", "[o]", "-crf", "30", *common,
                    os.path.join(vdir, "hero-1280.mp4")], check=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", vsrc, "-filter_complex",
                    loop + ";[v]fps=24,crop=608:1080:656:0,scale=540:960,gblur=sigma=4[o]", "-map", "[o]", "-crf", "31", *common,
                    os.path.join(vdir, "hero-540x960.mp4")], check=True)
    for name, vf in [("hero-poster-1280", "scale=1280:720,gblur=sigma=5.5"), ("hero-poster-540", "crop=608:1080:656:0,scale=540:960,gblur=sigma=4")]:
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "0.2", "-i", vsrc, "-frames:v", "1", "-vf", vf,
                        os.path.join("/tmp", name + ".png")], check=True)
        Image.open(os.path.join("/tmp", name + ".png")).convert("RGB").save(os.path.join(OUT, "img", name + ".webp"), "WEBP", quality=72, method=6)
    for n in ("hero-1280", "hero-540x960"):  # VP9 fallback for browsers without H.264
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", os.path.join(vdir, n + ".mp4"), "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "40",
                        "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-an", os.path.join(vdir, n + ".webm")], check=True)
    print("video done")

if manifest:
    mp = os.path.join(ROOT, "src", "data", "media.json")
    old = json.load(open(mp)) if os.path.exists(mp) else {}
    old.update(manifest)
    json.dump(old, open(mp, "w"), ensure_ascii=False, indent=1)
