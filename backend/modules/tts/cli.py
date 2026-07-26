"""
Outil en ligne de commande du module TTS — à lancer depuis `backend/`.

    uv run python -m modules.tts.cli --list
    uv run python -m modules.tts.cli --download fr_FR-siwis-medium
    uv run python -m modules.tts.cli --samples     # les 4 voix "medium" en WAV
    uv run python -m modules.tts.cli --say "Bonjour, il fait 21 degrés."

`--samples` écrit un WAV par voix dans `backend/data/tts/samples/` : de quoi
comparer au casque avant de choisir la voix définitive.

Sortie volontairement en ASCII : la console Windows n'est pas en UTF-8 quand
la sortie est redirigée vers un fichier ou un pipe.
"""

from __future__ import annotations

import argparse
import asyncio
import wave

from modules.tts import engine, piper_engine, voices


def _list() -> None:
    for entry in voices.catalog():
        mark = "x" if entry["installed"] else " "
        print(f" [{mark}] {entry['id']:<22} {entry['label']}  (~{entry['size_mb']} Mo)")
    print(f"\nModeles : {voices.VOICES_DIR}")


def _samples(voice_ids: list[str], text: str) -> None:
    out_dir = voices.VOICES_DIR.parent / "samples"
    out_dir.mkdir(parents=True, exist_ok=True)

    for voice_id in voice_ids:
        voices.ensure(voice_id)
        for speaker_id in sorted(voices.speakers(voice_id)) or [None]:
            suffix = f"-{speaker_id}" if speaker_id is not None else ""
            out = out_dir / f"{voice_id}{suffix}.wav"
            piper_engine.synthesize_to_file(text, out, voice_id, speaker_id=speaker_id)
            with wave.open(str(out), "rb") as wav:
                seconds = wav.getnframes() / wav.getframerate()
            print(f"  -> {out.name}  ({seconds:.1f} s)")

    print(f"\nEchantillons dans {out_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Voix Piper francaises du projet")
    parser.add_argument("--list", action="store_true", help="Liste le catalogue des voix")
    parser.add_argument("--download", metavar="VOICE", nargs="+", help="Telecharge une ou plusieurs voix")
    parser.add_argument("--samples", action="store_true", help="Genere un WAV par voix pour comparer")
    parser.add_argument("--say", metavar="TEXTE", help="Lit un texte avec la voix configuree")
    parser.add_argument("--text", default=voices.SAMPLE_TEXT, help="Texte des echantillons")
    args = parser.parse_args()

    if args.download:
        for voice_id in args.download:
            voices.ensure(voice_id)
            print(f"  -> {voice_id} installee")

    if args.samples:
        targets = args.download or [v["id"] for v in voices.CATALOG if v["quality"] == "medium"]
        _samples(targets, args.text)

    if args.say:
        asyncio.run(engine.speak(args.say))

    if args.list or not (args.download or args.samples or args.say):
        _list()


if __name__ == "__main__":
    main()
