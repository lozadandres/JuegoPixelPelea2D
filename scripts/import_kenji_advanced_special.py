"""Importa lanzamiento, dragón, explosión y quemadura avanzados de Kenji."""

from pathlib import Path
from PIL import Image

from import_luna_sprites import remove_baked_checker, remove_tiny_components


SOURCE = Path(r"C:\Users\lozad\Downloads")
TARGET = Path(__file__).resolve().parents[1] / "public" / "sprites" / "kenji"

SHEETS = {
    "special": (SOURCE / "ChatGPT Image 16 jul 2026, 21_31_23 (2).png", [(20, 290), (325, 650), (650, 935), (940, 1230), (1230, 1575), (1600, 1880)], (200, 176), 164),
    "proj": (SOURCE / "ChatGPT Image 16 jul 2026, 21_31_24 (3).png", [(45, 225), (255, 575), (575, 935), (920, 1420), (1425, 1915)], (320, 152), 144),
    "impact": (SOURCE / "ChatGPT Image 16 jul 2026, 21_31_23 (1).png", [(15, 360), (365, 725), (725, 1130), (1130, 1510), (1510, 1905)], (192, 192), 180),
    "burn": (SOURCE / "ChatGPT Image 16 jul 2026, 21_31_24 (4).png", [(90, 480), (530, 930), (960, 1385), (1425, 1840)], (144, 176), 164),
}


def extract(sheet: Image.Image, bounds: tuple[int, int], size: tuple[int, int], max_height: int) -> Image.Image:
    left, right = bounds
    image = remove_baked_checker(sheet.crop((left, 0, right, sheet.height)))
    bbox = image.getbbox()
    if not bbox:
        raise RuntimeError(f"Cuadro vacío: {bounds}")
    image = image.crop(bbox)
    scale = min((size[0] - 8) / image.width, max_height / image.height)
    image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(image, ((size[0] - image.width) // 2, size[1] - image.height))
    return remove_tiny_components(canvas, minimum_area=22)


def main() -> None:
    for name, (path, bounds, size, max_height) in SHEETS.items():
        sheet = Image.open(path).convert("RGBA")
        for index, crop in enumerate(bounds):
            extract(sheet, crop, size, max_height).save(TARGET / f"{name}_{index}.png", optimize=True)
    print("Especial avanzado de Kenji importado")


if __name__ == "__main__":
    main()
