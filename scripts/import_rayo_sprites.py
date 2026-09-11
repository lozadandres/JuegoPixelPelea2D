"""Importa las hojas entregadas de Rayo al formato del juego."""

from pathlib import Path
from PIL import Image

from import_luna_sprites import (
    frame_from_cell,
    remove_baked_checker,
    remove_tiny_components,
    subject_from_cell,
)


SOURCE = Path(r"C:\Users\lozad\Downloads")
DEST = Path(__file__).resolve().parents[1] / "public" / "sprites" / "rayo"
PREFIX = "ChatGPT Image 16 jul 2026, "

SHEETS = {
    "idle": ("17_23_54.png", 4, [0, 1, 2, 3]),
    "walk": ("17_24_23.png", 6, [0, 1, 3, 4]),
    "punch": ("17_24_18.png", 4, [0, 1, 2]),
    "kick": ("17_24_07.png", 5, [0, 1, 2]),
    "jump": ("17_24_28.png", 5, [1, 2]),
    "block": ("17_24_33.png", 3, [1]),
    "hurt": ("17_24_39.png", 3, [0, 1]),
    "ko": ("17_24_45.png", 5, [0, 2, 4]),
    "special": ("17_24_13.png", 3, [0, 1, 2]),
}


def make_portrait() -> Image.Image:
    sheet = Image.open(SOURCE / f"{PREFIX}17_24_02.png")
    cell = remove_baked_checker(sheet.crop((0, 0, sheet.width // 2, sheet.height)))
    bbox = cell.getbbox()
    if not bbox:
        raise RuntimeError("No se detectó el retrato de Rayo")
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
            image = frame_from_cell(sheet, cells, cell_index, base_scale)
            # Las hojas de Rayo dejan porciones grandes de la celda vecina;
            # sus efectos de golpe están unidos al cuerpo, así que conservamos
            # únicamente componentes con área significativa.
            remove_tiny_components(image, minimum_area=1000).save(
                DEST / f"{anim}_{frame}.png", optimize=True
            )
    make_portrait().save(DEST / "portrait.png", optimize=True)
    print(f"Sprites de Rayo importados en {DEST}")


if __name__ == "__main__":
    main()
