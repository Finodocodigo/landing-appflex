"""Generate the 10 catalog-spec placeholder images for the act08 shop.

Catalog spec enforced here: square 1:1, 1024x1024, RGB PNG, no overlay text.
Meta requires the FINAL catalog image to depict the product actually shipped —
these are layout placeholders until supplier photography exists.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # website/
REPO = Path("/workspaces/gringa-post")                 # gringa-post workspace
sys.path.insert(0, str(REPO / "src"))

from PIL import Image  # noqa: E402

from gringa_post.nanobanana import generate_image  # noqa: E402

OUT = ROOT / "public" / "images" / "shop"

STUDIO = (
    "Seamless soft off-white studio background (warm #F7F3EA), soft even diffused "
    "lighting from the upper left, gentle natural contact shadow beneath the product. "
    "Product is centred and fills about 80% of the square frame with clean margins. "
    "Crisp commercial e-commerce product photography, sharp focus, true colour, "
    "no text, no lettering, no labels, no logos, no watermark, no badges, no props."
)

ROOM = (
    "Calm editorial home-magazine interior photography, soft natural light, muted warm "
    "palette of oatmeal, pale oak and cream. Realistic depth of field. "
    "No people, no hands, no text, no lettering, no logos, no watermark."
)

TASKS: list[tuple[str, str]] = [
    (
        "air-purifier-01-ph.png",
        "A modern cylindrical home air purifier: matte warm-white upper body, woven "
        "oatmeal fabric mesh lower section, a brushed brass-toned control ring on top "
        "with a small plain circular display. Standing upright, photographed straight "
        "on at eye level. " + STUDIO,
    ),
    (
        "air-purifier-02-ph.png",
        "A modern cylindrical matte warm-white home air purifier with a woven oatmeal "
        "fabric mesh lower section, standing on a pale oak floor beside a linen armchair "
        "in a sunlit bedroom corner. Cream walls, a small stack of books and a ceramic "
        "mug on a side table, a sheer curtain diffusing morning light. " + ROOM,
    ),
    (
        "filter-01-ph.png",
        "Two identical cylindrical replacement air-purifier filters standing upright "
        "side by side: white pleated HEPA paper wrapped in a charcoal-grey activated "
        "carbon outer layer, with warm-white moulded plastic rims top and bottom. "
        + STUDIO,
    ),
    (
        "filter-02-ph.png",
        "Overhead flat lay on a pale oak table: one cylindrical pleated white HEPA and "
        "charcoal-carbon air-purifier filter lying beside a folded linen cloth and a "
        "small wooden-handled screwdriver. Warm morning light, soft shadows. " + ROOM,
    ),
    (
        "humidifier-01-ph.png",
        "A modern ultrasonic cool-mist humidifier: tall rounded matte ceramic-white body "
        "with a soft vertical ribbed texture and a pale wood-grain base ring, a fine "
        "plume of cool mist rising from the top nozzle. " + STUDIO,
    ),
    (
        "humidifier-02-ph.png",
        "A matte ceramic-white ribbed ultrasonic humidifier with a pale wood base ring "
        "on a walnut nightstand, a thin plume of mist catching low lamplight. Linen "
        "bedding softly out of focus behind it, a closed book and reading glasses "
        "beside it. Calm evening atmosphere. " + ROOM,
    ),
    (
        "slippers-01-ph.png",
        "A pair of closed-back indoor house slippers in heathered oatmeal wool-look "
        "fabric with soft cream faux-shearling lining, an adjustable hook-and-loop strap "
        "across the instep, and a thick charcoal rubber outsole with visible grip tread. "
        "Angled three-quarter view, both slippers side by side. " + STUDIO,
    ),
    (
        "slippers-02-ph.png",
        "A single indoor house slipper in heathered oatmeal fabric tipped up to show its "
        "thick charcoal rubber outsole with a deep circular grip-tread pattern, resting "
        "on a pale oak wood floor next to its pair. Warm morning side light. " + ROOM,
    ),
    (
        "nightlight-01-ph.png",
        "Four small plug-in motion-sensor night lights arranged in a neat row: compact "
        "rounded matte warm-white housings with a frosted amber-glowing panel on the "
        "front face; one unit turned to show its flat two-prong US plug. " + STUDIO,
    ),
    (
        "nightlight-02-ph.png",
        "A dim hallway at night: a small plug-in motion-sensor night light with a frosted "
        "amber glow plugged into a wall outlet low on a cream wall, casting a soft warm "
        "pool of light across a pale oak floor and the bottom step of a staircase. Calm, "
        "safe, no glare. " + ROOM,
    ),
]


def square_1024(path: Path) -> None:
    """Force exact 1024x1024 RGB — catalog minimum is 500px, 1024 is Meta's rec."""
    im = Image.open(path)
    if im.mode != "RGB":
        bg = Image.new("RGB", im.size, (247, 243, 234))
        bg.paste(im, mask=im.split()[-1] if im.mode in ("RGBA", "LA") else None)
        im = bg
    w, h = im.size
    if w != h:  # centre-crop to square before resizing
        side = min(w, h)
        im = im.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))
    im.resize((1024, 1024), Image.LANCZOS).save(path, "PNG", optimize=True)


def to_jpeg(path: Path) -> None:
    """Ship JPEG, not PNG. Meta accepts JPEG/PNG/GIF for image_link (never WebP),
    and a 1024px JPEG at q=90 is ~8x lighter than the PNG the model returns."""
    dst = path.with_suffix(".jpg")
    Image.open(path).convert("RGB").save(dst, "JPEG", quality=90, optimize=True, progressive=True)
    path.unlink()


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:]) or None
    failed = []
    for name, prompt in TASKS:
        if only and name not in only:
            continue
        dest = OUT / name
        try:
            generate_image(
                prompt,
                dest,
                aspect_ratio="1:1",
                orientation_hint="square product image for a shopping catalog",
            )
            square_1024(dest)
            to_jpeg(dest)
            print(f"OK   {dest.with_suffix('.jpg').name}  {dest.with_suffix('.jpg').stat().st_size // 1024} KB", flush=True)
        except Exception as exc:  # noqa: BLE001
            failed.append(name)
            print(f"FAIL {name}: {exc}", flush=True)
    print(f"\ndone. failed={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
