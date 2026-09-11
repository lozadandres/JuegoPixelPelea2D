"""Importa carga, ventisca, impacto y estados de congelacion de Luna."""

from pathlib import Path
from PIL import Image, ImageFilter

from import_luna_sprites import remove_baked_checker, remove_tiny_components


SOURCE = Path(r"C:\Users\lozad\Downloads")
TARGET = Path(__file__).resolve().parents[1] / "public" / "sprites" / "luna"

GROUPS = {
    "special": ("ChatGPT Image 17 jul 2026, 00_16_58 (1).png",
                [(20, 315), (310, 610), (605, 900), (885, 1190), (1180, 1485), (1880, 2160)], (232, 176)),
    "proj": ("ChatGPT Image 17 jul 2026, 00_16_59 (2).png",
             [(35, 300), (300, 690), (675, 1110), (1090, 1640), (1620, 2160)], (320, 152)),
    "impact": ("ChatGPT Image 17 jul 2026, 00_17_00 (3).png",
               [(55, 325), (315, 780), (760, 1240), (1220, 1710), (1690, 2160)], (210, 192)),
    "frost": ("ChatGPT Image 17 jul 2026, 00_17_00 (4).png",
              [(20, 535), (520, 1065), (1045, 1605), (1580, 2155)], (190, 80)),
    "freeze": ("ChatGPT Image 16 jul 2026, 23_41_30.png",
               [(120, 820), (820, 1570)], (176, 190)),
    "frozen_body": ("ChatGPT Image 16 jul 2026, 23_41_50.png",
                    [(120, 820), (820, 1570)], (176, 190)),
    "limbs": ("ChatGPT Image 16 jul 2026, 23_41_06.png",
              [(170, 480), (475, 800), (865, 1180), (1170, 1495)], (176, 190)),
    "thaw": ("ChatGPT Image 16 jul 2026, 23_20_58.png",
             [(15, 500), (495, 965), (950, 1455), (1440, 1905)], (176, 190)),
}


def remove_gray_checker(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    alpha = Image.new("L", rgb.size, 0)
    src, dst = rgb.load(), alpha.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            r, g, b = src[x, y]
            # El damero de estas hojas es gris neutro; el hielo conserva una
            # diferencia azul/cian suficiente para separarlo limpiamente.
            if max(r, g, b) - min(r, g, b) > 55 or min(r, g, b) < 110:
                dst[x, y] = 255
    alpha = alpha.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def extract(sheet: Image.Image, bounds: tuple[int, int], size: tuple[int, int], gray_checker: bool) -> Image.Image:
    crop = sheet.crop((bounds[0], 0, bounds[1], sheet.height))
    image = remove_gray_checker(crop) if gray_checker else remove_baked_checker(crop)
    image = remove_tiny_components(image, minimum_area=45)
    bbox = image.getbbox()
    if not bbox:
        raise RuntimeError(f"Cuadro vacio: {bounds}")
    image = image.crop(bbox)
    scale = min((size[0] - 8) / image.width, (size[1] - 8) / image.height)
    image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(image, ((size[0] - image.width) // 2, size[1] - image.height))
    return remove_tiny_components(canvas, minimum_area=18)


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    for group, (filename, bounds, size) in GROUPS.items():
        sheet = Image.open(SOURCE / filename).convert("RGBA")
        for index, crop in enumerate(bounds):
            frame = extract(sheet, crop, size, group in {"freeze", "frozen_body", "limbs", "thaw"})
            if group == "special" and index == len(bounds) - 1:
                # Restos de la ventisca de la celda anterior no pertenecen a
                # la pose de recuperacion de Luna.
                frame.paste((0, 0, 0, 0), (0, 0, 62, frame.height))
            frame.save(TARGET / f"{group}_{index}.png", optimize=True)
    print("Especial avanzado de Luna importado")


if __name__ == "__main__":
    main()
