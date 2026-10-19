# Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find package 'sharp'` | `sharp` is not installed where the generator runs (it resolves from the current directory) | Run from a project that has `sharp`, or install it there (ask first) |
| `sharp` install fails on Apple Silicon / Linux ARM | Prebuilt binary missing for the platform | `npm install --os=<os> --cpu=<cpu> sharp`, or upgrade Node to a current LTS |
| `Could not find package "flutter_launcher_icons"` | Package not in `dev_dependencies` | `flutter pub add --dev flutter_launcher_icons flutter_native_splash` (ask first) |
| Generated YAML is ignored | The package reads its own YAML file first, then falls back to a block in `pubspec.yaml`. A stale `pubspec.yaml` block is harmless but confusing | Offer to delete the `flutter_launcher_icons:` / `flutter_native_splash:` block from `pubspec.yaml` |
| Logo edges look cut off on Android 12+ | The system crops the splash image to a 768px circle | Already handled: the generator writes `android12_*.png` with the mark shrunk to fit. If an old config points `android_12.image` elsewhere, regenerate the YAML |
| Adaptive icon too small or too large | `androidAdaptiveInset` (percent padding, package default 16) | Adjust it in the config and re-run |
| `web/index.html` shows only blank-line changes | `flutter_native_splash` re-inserts blank lines on every run | The generator reverts whitespace-only changes when the project is a git repo |
| Splash disappears before the app is ready | The splash is removed on the first Flutter frame | Suggest `FlutterNativeSplash.preserve()` in `main()` and `remove()` once startup finishes. This is app code: offer it, don't add it unprompted |
| Recolor did nothing | The SVG's colors are not in `recolor` (e.g. `#1A1A1A`, gradients) | Re-run `check-svg.mjs`, then add each listed color to `recolor` |
