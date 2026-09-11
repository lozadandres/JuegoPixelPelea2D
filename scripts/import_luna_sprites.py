"""Importa las hojas entregadas de Luna al formato de sprites del juego."""

from pathlib import Path
from PIL import Image, ImageFilter


SOURCE = Path(r"C:\Users\lozad\Downloads")
DEST = Path(__file__).resolve().parents[1] / "public" / "sprites" / "luna"
PREFIX = "ChatGPT Image 16 jul 2026, "

SHEETS = {
    "idle": ("16_11_12.png", 4, [0, 1, 2, 3]),
    "walk": ("16_11_53.png", 6, [0, 1, 3, 4]),
    "punch": ("16_11_48.png", 4, [0, 1, 2]),
    "kick": ("16_11_24.png", 5, [0, 1, 2]),
    "jump": ("16_11_58.png", 5, [1, 2]),
    "block": ("16_12_03.png", 3, [1]),
    "hurt": ("16_12_10.png", 3, [0, 1]),
    "ko": ("16_12_18.png", 5, [0, 2, 4]),
    "special": ("16_11_31.png", 3, [0, 1, 2]),
}


def remove_baked_checker(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    pixels = rgb.load()
    mask = Image.new("L", rgb.size, 0)
    out = mask.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            r, g, b = pixels[x, y]
            if min(r, g, b) < 232 or max(r, g, b) - min(r, g, b) > 16:
                out[x, y] = 255
    mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    rgba = rgb.convert("RGBA")
    rgba.putalpha(mask)
    return rgba


def subject_from_cell(sheet: Image.Image, cells: int, index: int) -> Image.Image:
    left = round(sheet.width * index / cells)
    right = round(sheet.width * (index + 1) / cells)
    cell = remove_baked_checker(sheet.crop((left, 0, right, sheet.height)))
    bbox = cell.getbbox()
    if not bbox:
        raise RuntimeError(f"No se detectó Luna en la celda {index}")
    return cell.crop(bbox)


def frame_from_cell(sheet: Image.Image, cells: int, index: int, base_scale: float) -> Image.Image:
    subject = subject_from_cell(sheet, cells, index)
    scale = min(base_scale, 156 / subject.width)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (160, 176), (0, 0, 0, 0))
    canvas.alpha_composite(subject, ((160 - subject.width) // 2, 176 - subject.height))
    return remove_tiny_components(canvas)


def remove_tiny_components(image: Image.Image, minimum_area: int = 18) -> Image.Image:
    """Elimina restos aislados de personajes pertenecientes a celdas vecinas."""
    alpha = image.getchannel("A")
    px = alpha.load()
    visited: set[tuple[int, int]] = set()
    discard: list[tuple[int, int]] = []
    for y in range(alpha.height):
        for x in range(alpha.width):
            if px[x, y] < 24 or (x, y) in visited:
                continue
            stack = [(x, y)]
            visited.add((x, y))
            component: list[tuple[int, int]] = []
            while stack:
                cx, cy = stack.pop()
                component.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < alpha.width and 0 <= ny < alpha.height and px[nx, ny] >= 24 and (nx, ny) not in visited:
                        visited.add((nx, ny))
                        stack.append((nx, ny))
            if len(component) < minimum_area:
                discard.extend(component)
    rgba = image.copy()
    out_alpha = rgba.getchannel("A")
    out = out_alpha.load()
    for x, y in discard:
        out[x, y] = 0
    rgba.putalpha(out_alpha)
    return rgba


def make_portrait() -> Image.Image:
    sheet = Image.open(SOURCE / f"{PREFIX}16_11_18.png")
    cell = remove_baked_checker(sheet.crop((0, 0, sheet.width // 2, sheet.height)))
    bbox = cell.getbbox()
    if not bbox:
        raise RuntimeError("No se detectó el retrato de Luna")
    subject = cell.crop(bbox)
    subject = subject.crop((0, 0, subject.width, round(subject.height * 0.58)))
    scale = min(122 / subject.height, 118 / subject.width)
    subject = subject.resize((round(subject.width * scale), round(subject.height * scale)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    canvas.alpha_composite(subject, ((128 - subject.width) // 2, 128 - subject.height))
    return canvas


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    for anim, (filename, cells, selected) in SHEETS.items():
        sheet = Image.open(SOURCE / f"{PREFIX}{filename}")
        reference = subject_from_cell(sheet, cells, selected[0])
        base_scale = min(148 / reference.height, 156 / reference.width)
        for frame, cell_index in enumerate(selected):
            frame_from_cell(sheet, cells, cell_index, base_scale).save(
                DEST / f"{anim}_{frame}.png", optimize=True
            )
    make_portrait().save(DEST / "portrait.png", optimize=True)
    print(f"Sprites de Luna importados en {DEST}")


if __name__ == "__main__":
    main()
