"""Importa las hojas entregadas por el usuario al formato de sprites del juego."""

from pathlib import Path
from PIL import Image, ImageFilter


SOURCE = Path(r"C:\Users\lozad\Downloads")
DEST = Path(__file__).resolve().parents[1] / "public" / "sprites" / "kenji"
PREFIX = "ChatGPT Image 16 jul 2026, "

# archivo, cantidad de celdas, celdas utilizadas
SHEETS = {
    "idle": ("14_16_57.png", 4, [0, 1, 2, 3]),
    "walk": ("14_17_31.png", 6, [0, 1, 3, 4]),
    "punch": ("14_17_25.png", 4, [0, 1, 2]),
    "kick": ("14_17_10.png", 5, [0, 1, 2]),
    "jump": ("14_17_37.png", 5, [1, 2]),
    "block": ("14_17_41.png", 3, [1]),
    "hurt": ("14_17_47.png", 3, [0, 1]),
    "ko": ("14_17_53.png", 5, [0, 2, 4]),
    "special": ("14_17_15.png", 3, [0, 1, 2]),
}


def remove_baked_checker(image: Image.Image) -> Image.Image:
    """Convierte blancos/grises del tablero en alpha y conserva huecos interiores."""
    rgb = image.convert("RGB")
    pixels = rgb.load()
    mask = Image.new("L", rgb.size, 0)
    out = mask.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            r, g, b = pixels[x, y]
            # El tablero usa grises casi neutros entre 240 y 255.
            if min(r, g, b) < 232 or max(r, g, b) - min(r, g, b) > 16:
                out[x, y] = 255

    # Cierra pequeños agujeros producidos por brillos blancos en ojos/ropa.
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
        raise RuntimeError(f"No se detectó personaje en la celda {index}")
    return cell.crop(bbox)


def frame_from_cell(sheet: Image.Image, cells: int, index: int, base_scale: float) -> Image.Image:
    subject = subject_from_cell(sheet, cells, index)

    # Usa una escala única por hoja para que agacharse no agrande al personaje.
    scale = min(base_scale, 156 / subject.width)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (160, 176), (0, 0, 0, 0))
    x = (160 - subject.width) // 2
    y = 176 - subject.height
    canvas.alpha_composite(subject, (x, y))
    return canvas


def make_portrait() -> Image.Image:
    sheet = Image.open(SOURCE / f"{PREFIX}14_17_03.png")
    cell = sheet.crop((0, 0, sheet.width // 2, sheet.height))
    subject = remove_baked_checker(cell)
    bbox = subject.getbbox()
    if not bbox:
        raise RuntimeError("No se detectó el retrato")
    subject = subject.crop(bbox)
    # La selección necesita un retrato, no la figura de cuerpo entero.
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
            frame_from_cell(sheet, cells, cell_index, base_scale).save(DEST / f"{anim}_{frame}.png", optimize=True)
    make_portrait().save(DEST / "portrait.png", optimize=True)
    print(f"Sprites de Kenji importados en {DEST}")


if __name__ == "__main__":
    main()
