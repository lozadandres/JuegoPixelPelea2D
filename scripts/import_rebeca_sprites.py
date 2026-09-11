"""Importa las hojas de Rebeca sobre la ranura interna `bruno`."""

from pathlib import Path
from PIL import Image

from import_luna_sprites import (
    frame_from_cell,
    remove_baked_checker,
    remove_tiny_components,
    subject_from_cell,
)


SOURCE = Path(r"C:\Users\lozad\Downloads")
DEST = Path(__file__).resolve().parents[1] / "public" / "sprites" / "bruno"
PREFIX = "ChatGPT Image 16 jul 2026, "

SHEETS = {
    "idle": ("16_57_05.png", 4, [0, 1, 2, 3]),
    "walk": ("16_57_31.png", 6, [0, 1, 3, 4]),
    "punch": ("16_57_27.png", 4, [0, 1, 2]),
    "kick": ("16_57_17.png", 5, [0, 1, 2]),
    "jump": ("16_57_36.png", 5, [1, 2]),
    "block": ("16_57_41.png", 3, [1]),
    "hurt": ("16_57_45.png", 3, [0, 1]),
    "ko": ("16_57_50.png", 5, [0, 2, 4]),
    "special": ("16_57_22.png", 3, [0, 1, 2]),
}


def make_portrait() -> Image.Image:
    sheet = Image.open(SOURCE / f"{PREFIX}16_57_12.png")
    cell = remove_baked_checker(sheet.crop((0, 0, sheet.width // 2, sheet.height)))
    bbox = cell.getbbox()
    if not bbox:
        raise RuntimeError("No se detectó el retrato de Rebeca")
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
            remove_tiny_components(image, minimum_area=45).save(
                DEST / f"{anim}_{frame}.png", optimize=True
            )
    make_portrait().save(DEST / "portrait.png", optimize=True)
    print(f"Sprites de Rebeca importados en {DEST}")


if __name__ == "__main__":
    main()
