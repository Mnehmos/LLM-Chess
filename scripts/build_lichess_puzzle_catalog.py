import argparse
import csv
import io
import json
import os
import random
import urllib.request
from datetime import datetime, timezone

import zstandard


DEFAULT_URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
DEFAULT_RAW_PATH = os.path.join("data", "raw", "lichess_db_puzzle.csv.zst")
DEFAULT_OUTPUT_PATH = os.path.join("public", "data", "lichess-puzzles-1500-plus.json")


def download_file(url: str, target_path: str) -> None:
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    print(f"Downloading {url} -> {target_path}")
    with urllib.request.urlopen(url) as response, open(target_path, "wb") as target:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            target.write(chunk)


def reservoir_sample(raw_path: str, min_rating: int, sample_size: int) -> tuple[list[dict], int]:
    rng = random.Random()
    reservoir: list[dict] = []
    eligible_count = 0

    with open(raw_path, "rb") as compressed:
        dctx = zstandard.ZstdDecompressor()
        with dctx.stream_reader(compressed) as reader:
            text_stream = io.TextIOWrapper(reader, encoding="utf-8", newline="")
            csv_reader = csv.DictReader(text_stream)
            for row in csv_reader:
                try:
                    rating = int(row["Rating"])
                except (KeyError, TypeError, ValueError):
                    continue
                if rating < min_rating:
                    continue
                puzzle_id = row.get("PuzzleId")
                fen = row.get("FEN")
                moves = row.get("Moves")
                themes = row.get("Themes")
                if not puzzle_id or not fen or not moves:
                    continue

                eligible_count += 1
                entry = {
                    "id": puzzle_id,
                    "fen": fen,
                    "rating": rating,
                    "themes": [theme for theme in (themes or "").split(" ") if theme],
                    "solution": [move for move in moves.split(" ") if move],
                }

                if len(reservoir) < sample_size:
                    reservoir.append(entry)
                    continue

                replacement_index = rng.randrange(eligible_count)
                if replacement_index < sample_size:
                    reservoir[replacement_index] = entry

    rng.shuffle(reservoir)
    return reservoir, eligible_count


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a local random Lichess puzzle catalog.")
    parser.add_argument("--download", action="store_true", help="Download the official Lichess puzzle database if needed.")
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--raw-path", default=DEFAULT_RAW_PATH)
    parser.add_argument("--output", default=DEFAULT_OUTPUT_PATH)
    parser.add_argument("--min-rating", type=int, default=1500)
    parser.add_argument("--sample-size", type=int, default=50000)
    args = parser.parse_args()

    if args.download or not os.path.exists(args.raw_path):
        download_file(args.url, args.raw_path)

    puzzles, eligible_count = reservoir_sample(args.raw_path, args.min_rating, args.sample_size)
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": args.url,
        "minRating": args.min_rating,
        "sampleSize": len(puzzles),
        "eligibleCount": eligible_count,
        "puzzles": puzzles,
    }
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))

    print(f"Wrote {len(puzzles)} puzzles to {args.output} from {eligible_count} eligible records.")


if __name__ == "__main__":
    main()
