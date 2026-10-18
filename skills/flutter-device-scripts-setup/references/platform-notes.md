# Platform notes for the generated scripts

- **iOS debug needs `flutter run`.** `devicectl` can install and launch a debug Flutter app, but the device then shows Flutter's placeholder screen ("debug mode Flutter apps can only be launched from Flutter tooling"). `run_all.sh` therefore keeps `flutter run -d <udid> --debug` alive in the background (pid and log under `scripts/.run/`). Stop it with `kill $(cat scripts/.run/<udid>.pid)`. Release builds have no such restriction, which is why `build_release.sh` uses plain install + launch.
- **macOS launches with `open`, never `flutter run`.** A child of `flutter run` has camera and microphone permission checked against the parent terminal and is denied with no prompt.
- **Android release signing.** A fresh Flutter project signs release with the debug keystore, which is fine for your own devices but not for the Play Store.
- **Debug application id suffix.** If `debug { applicationIdSuffix = ".debug" }` exists, the debug launch uses `<id>.debug/<namespace>.<Activity>`; release launches use the plain id. The detector reads this; product flavors are not handled (add `--flavor` to the `flutter build` calls in `lib.sh`).
- **Wireless or idle iPhones.** Only iPhones whose devicectl tunnel state is `connected` are used; a cabled but idle phone is skipped until it wakes.
- **Bash 3.2.** The scripts stay ASCII-only and brace variables (`${var}`), because macOS's default bash can misparse an unbraced variable followed by non-ASCII bytes.
- **Stale APKs.** `lib.sh` runs an explicit `flutter build apk` instead of `flutter install`, which has been seen reusing an APK built before a manifest change.
