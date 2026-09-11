"""Prepara las hojas del ninja asistente de Kenji para el motor del juego."""

from pathlib import Path
from PIL import Image, ImageFilter


SOURCE = Path(r"C:\Users\lozad\Downloads")
DEST = Path(__file__).resolve().parents[1] / "public" / "sprites" / "companions" / "kenji"
PREFIX = "ChatGPT Image 17 jul 2026, "

# archivo, columnas de la hoja. Todas las hojas traen una secuencia horizontal.
SHEETS: dict[str, tuple[str, int]] = {
    "idle": ("18_12_44 (1).png", 4),
    "walk": ("18_13_25 (1).png", 6),
    "attack": ("18_13_26 (2).png", 5),
    "hurt": ("18_13_26 (4).png", 3),
    "ko": ("18_13_26 (5).png", 4),
    "enter": ("18_12_45 (3).png", 5),
    "vanish": ("18_12_45 (4).png", 4),
}


def remove_baked_checker(image: Image.Image) -> Image.Image:
    """Elimina el tablero claro sin borrar los detalles oscuros del ninja."""
    rgb = image.convert("RGB")
    mask = Image.new("L", rgb.size, 0)
    source = rgb.load()
    alpha = mask.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            r, g, b = source[x, y]
            if min(r, g, b) < 232 or max(r, g, b) - min(r, g, b) > 16:
                alpha[x, y] = 255
    # Mantiene continuos los contornos y los ojos brillantes.
    mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    result = rgb.convert("RGBA")
    result.putalpha(mask)
    return result


def subject_from_cell(sheet: Image.Image, cells: int, index: int) -> Image.Image:
    left = round(sheet.width * index / cells)
    right = round(sheet.width * (index + 1) / cells)
    cell = remove_baked_checker(sheet.crop((left, 0, right, sheet.height)))
    bounds = cell.getbbox()
    if not bounds:
        raise RuntimeError(f"No se detectó el ninja en la celda {index}")
    return cell.crop(bounds)


def make_frame(sheet: Image.Image, cells: int, index: int, scale: float) -> Image.Image:
    subject = subject_from_cell(sheet, cells, index)
    # El mismo tamaño por hoja evita saltos visuales durante una animación.
    resize = min(scale, 156 / subject.width)
    subject = subject.resize(
        (max(1, round(subject.width * resize)), max(1, round(subject.height * resize))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (160, 176), (0, 0, 0, 0))
    canvas.alpha_composite(subject, ((160 - subject.width) // 2, 176 - subject.height))
    return canvas


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    for animation, (filename, cells) in SHEETS.items():
        sheet = Image.open(SOURCE / f"{PREFIX}{filename}")
        reference = subject_from_cell(sheet, cells, 0)
        scale = min(148 / reference.height, 156 / reference.width)
        for frame in range(cells):
            make_frame(sheet, cells, frame, scale).save(DEST / f"{animation}_{frame}.png", optimize=True)
    print(f"Sprites del asistente de Kenji importados en {DEST}")


if __name__ == "__main__":
    main()
