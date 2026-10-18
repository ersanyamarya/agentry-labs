# Portability checklist

Everything copied from the reference project needs a decision. Go through this list file by file after copying.

| File | What is specific | What to do |
| --- | --- | --- |
| `lib/app.ts` | Placeholders: app name, package, folder, macOS process | Fill from the report |
| `lib/cards.ts` | Copy, screen slugs, brand wording and example brokers | Rewrite the cards for this app from the screen list in step 3 |
| `theme.ts` | Colours and font stack | Replace with the confirmed values |
| `capture-auto.ts` | The Mac process name and the simulator classes | Set the process name from `macosProductName` |
| `generate-website-brand.ts` | The logo path and the share card copy | Point at this app's logo, and the copy at this app's name |
| `generate-store-assets.ts` | The capture folders and the card sets | Keep the sets the user chose in step 3 |
| `project.json.template` | Paths and target names | Use this repo's folders |
| `demo_mode.dart.template` | Models, box names and endpoints | Replace with the discovered data layer |
| `capture_test.dart.template` | Screen list and the Mac marker | Replace with the ordered screens from step 3 |

Search the copied files for the reference app's name and paths before the first run. Anything you do not change must be listed in the report.
