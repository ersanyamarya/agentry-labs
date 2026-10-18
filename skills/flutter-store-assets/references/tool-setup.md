# Setting up the tool

The tool is a Nx or plain Node project with three steps: capture, store and website. The files in `assets/image-gen-tools/` are the working reference.

1. **Copy** `assets/image-gen-tools/` into the tool folder. Copy `lib/` too.
2. **Configure.** Every app-specific value lives in `lib/app.ts`: `APP_NAME`, `APP_PACKAGE`, `APP_DIR` and `MAC_PROCESS`. The Dart templates use `{{APP_PACKAGE}}`. Replace each placeholder, and search the tool folder for any value you did not set. Fill `project.json.template` with the tool folder and the app folder, then save it as `project.json` (or the package scripts, if the repo has no Nx). Set the macOS process name from `macosProductName`.
3. **Theme.** Write `theme.ts` from the colours you confirmed. Keep the same keys: canvas, primary, text, accent and the font stack.
4. **Dependencies.** Install `playwright-core` and `sharp` with the detected package manager. Run the browser install once.
5. **Commands.**
   - `capture`: builds the app with `--dart-define=DEMO=true` on each booted iPhone or iPad simulator, and on this Mac. Writes `captures/{ios,ipad,macos}/` and their `dark/` folders.
   - `store`: renders the store cards from the captures, plus the feature graphic and the store icons. Takes a set name: `ios`, `android`, `android-tablet`, `ipad` or `macos`.
   - `website`: renders the light and dark site shots, the favicons and the share card, when a website folder exists.
6. **Check.** Run `typecheck` on the tool. Run the `store` set for one platform, and open one of its images before the rest.
