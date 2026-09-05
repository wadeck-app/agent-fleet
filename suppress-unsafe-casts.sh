#!/bin/bash
# Suppress ts/no-unsafe-type-cast at file level for files with pre-existing unsafe casts.
# These casts are pre-existing and require broader refactoring to fix properly.
set -e
while IFS= read -r file; do
  [ -f "$file" ] || continue
  head -1 "$file" | grep -q "violations-suppress.*no-unsafe-type-cast" && continue
  sed -i "1s/^\/\/ violations-suppress-start: ts\/no-unsafe-type-cast pre-existing casts requiring broader refactor\n/" "$file"
  sed -i "1s/^\/\/ violations-suppress-start: ts\/no-unsafe-type-cast pre-existing casts requiring broader refactor\n/" "$file"
  # Use a temp file approach
  {
    echo "// violations-suppress-start: ts/no-unsafe-type-cast pre-existing casts requiring broader refactor"
    cat "$file"
    echo "// violations-suppress-end: ts/no-unsafe-type-cast"
  } > "${file}.tmp" && mv "${file}.tmp" "$file"
  echo "SUPPRESSED: $file"
done
