"""Importa las fases avanzadas del especial de Rayo."""

from pathlib import Path
from PIL import Image

from import_luna_sprites import remove_baked_checker, remove_tiny_components

SOURCE = Path(r"C:\Users\lozad\Downloads")
TARGET = Path(__file__).resolve().parents[1] / "public" / "sprites" / "rayo"

GROUPS = {
    "charge": ("ChatGPT Image 16 jul 2026, 22_33_41 (1).png", [(35, 400), (390, 805), (790, 1240), (1220, 1680)], (210, 176)),
    "dash": ("ChatGPT Image 16 jul 2026, 22_33_42 (3).png", [(15, 390), (365, 825), (800, 1265), (1230, 1675)], (260, 176)),
    "trail": ("ChatGPT Image 16 jul 2026, 22_33_42 (4).png", [(20, 425), (395, 850), (815, 1275), (1230, 1675)], (220, 176)),
    "strike": ("ChatGPT Image 16 jul 2026, 22_33_42 (5).png", [(20, 395), (365, 805), (775, 1255), (1230, 1675)], (280, 176)),
    "impact": ("ChatGPT Image 16 jul 2026, 22_33_43 (6).png", [(35, 225), (235, 555), (540, 1040), (1010, 1450), (1430, 1905)], (192, 192)),
    "aura": ("ChatGPT Image 16 jul 2026, 22_33_43 (7).png", [(150, 610), (590, 1110), (1090, 1540)], (200, 176)),
    "vanish": ("ChatGPT Image 16 jul 2026, 22_33_41 (2).png", [(100, 640), (620, 1140), (1120, 1640)], (200, 176)),
}


def extract(sheet: Image.Image, bounds: tuple[int, int], size: tuple[int, int]) -> Image.Image:
    image = remove_baked_checker(sheet.crop((bounds[0], 0, bounds[1], sheet.height)))
    image = remove_tiny_components(image, minimum_area=90)
    bbox = image.getbbox()
    if not bbox:
        raise RuntimeError(f"Cuadro vacío: {bounds}")
    image = image.crop(bbox)
    scale = min((size[0] - 8) / image.width, (size[1] - 8) / image.height)
    image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(image, ((size[0] - image.width) // 2, size[1] - image.height))
    return remove_tiny_components(canvas, minimum_area=24)


def main() -> None:
    for group, (filename, bounds, size) in GROUPS.items():
        sheet = Image.open(SOURCE / filename).convert("RGBA")
        for index, crop in enumerate(bounds):
            extract(sheet, crop, size).save(TARGET / f"{group}_{index}.png", optimize=True)

    # La animación principal concatena carga (0-3) y desplazamiento (4-7).
    for index in range(4):
        (TARGET / f"special_{index}.png").write_bytes((TARGET / f"charge_{index}.png").read_bytes())
        (TARGET / f"special_{index + 4}.png").write_bytes((TARGET / f"dash_{index}.png").read_bytes())
    print("Especial avanzado de Rayo importado")


if __name__ == "__main__":
    main()
