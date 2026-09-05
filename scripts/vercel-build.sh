#!/usr/bin/env bash
# Vercel build script for LeagueTap Flutter web.
# Vercel's build image doesn't have Flutter preinstalled, so this downloads
# the Flutter SDK fresh each build, then builds the web release bundle.
set -euo pipefail

FLUTTER_VERSION="stable"
FLUTTER_DIR="$HOME/flutter"

if [ ! -d "$FLUTTER_DIR" ]; then
  echo "Cloning Flutter SDK ($FLUTTER_VERSION)..."
  git clone https://github.com/flutter/flutter.git -b "$FLUTTER_VERSION" "$FLUTTER_DIR" --depth 1
fi

export PATH="$FLUTTER_DIR/bin:$PATH"

flutter doctor -v
flutter pub get
flutter build web --release
