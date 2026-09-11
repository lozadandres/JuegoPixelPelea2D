"""Importa el especial sismico avanzado de Rebeca desde sus hojas fuente."""

from pathlib import Path
from PIL import Image

from import_luna_sprites import remove_baked_checker, remove_tiny_components


SOURCE = Path(r"C:\Users\lozad\Downloads")
TARGET = Path(__file__).resolve().parents[1] / "public" / "sprites" / "bruno"

SHEETS = {
    # Nombre de salida: (archivo, limites horizontales, lienzo, altura maxima)
    "special": ("ChatGPT Image 17 jul 2026, 14_06_36 (1).png",
                [(10, 305), (300, 620), (610, 930), (920, 1240), (1230, 1550), (1540, 1860), (1850, 2165)], (232, 176), 168),
    "proj": ("ChatGPT Image 17 jul 2026, 14_06_36 (3).png",
             [(15, 285), (275, 610), (600, 970), (960, 1360), (1350, 1750), (1740, 2160)], (360, 132), 122),
    "impact": ("ChatGPT Image 17 jul 2026, 14_06_36 (2).png",
               [(25, 355), (360, 705), (710, 1130), (1135, 1600), (1610, 2150)], (300, 190), 180),
    "aura": ("ChatGPT Image 17 jul 2026, 14_06_37 (4).png",
             [(45, 395), (400, 780), (785, 1235), (1240, 1690), (1700, 2145)], (310, 92), 84),
    "rock": ("ChatGPT Image 17 jul 2026, 14_07_02 (1).png",
             [(45, 445), (465, 955), (975, 1515), (1570, 2135)], (300, 190), 180),
    "seismic_dust": ("ChatGPT Image 17 jul 2026, 14_07_03 (2).png",
                     [(45, 420), (435, 890), (905, 1555), (1580, 2125)], (300, 160), 150),
}


def extract(sheet: Image.Image, bounds: tuple[int, int],
            size: tuple[int, int], max_height: int) -> Image.Image:
    left, right = bounds
    image = remove_baked_checker(sheet.crop((left, 0, right, sheet.height)))
    image = remove_tiny_components(image, minimum_area=35)
    bbox = image.getbbox()
    if not bbox:
        raise RuntimeError(f"Cuadro vacio: {bounds}")
    image = image.crop(bbox)
    scale = min((size[0] - 8) / image.width, max_height / image.height)
    image = image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    # Todos los efectos de Rebeca se anclan al suelo.
    canvas.alpha_composite(image, ((size[0] - image.width) // 2, size[1] - image.height))
    return remove_tiny_components(canvas, minimum_area=18)


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    for group, (filename, bounds, size, max_height) in SHEETS.items():
        sheet = Image.open(SOURCE / filename).convert("RGBA")
        for index, crop in enumerate(bounds):
            frame = extract(sheet, crop, size, max_height)
            frame.save(TARGET / f"{group}_{index}.png", optimize=True)
    print("Especial avanzado de Rebeca importado")


if __name__ == "__main__":
    main()
