# Prerequisites

Check each item against the detection report. Ask only for items that are missing and that a person has to provide.

| Item | Where it comes from | If missing |
| --- | --- | --- |
| Flutter SDK | `tools.flutter` | Stop. Ask the user to install Flutter. |
| Xcode and simulators | `tools.xcrun` and `booted` | Ask the user to install Xcode, then boot the iPhone and iPad simulators. Never boot them yourself. |
| Node and a package manager | `tools.node`, `packageManager` | Use the lockfile's manager. Ask before installing anything. |
| Logo SVG | `flutterApps[].iconSource` | Ask for a flat, transparent SVG. Use the brand skill when the user has one. |
| Brand colours | `themeSources` | Ask which file holds them. Never invent colours. |
| Website folder | `websites` | Skip the website set, and say so. |
| Mac capture | `tools.screencapture`, `macosProductName` | Skip the Mac set, and say so. The user must grant Screen Recording and Accessibility permission. |
| Play tablet set | iPad simulator booted | Skip the Play tablet set until an iPad is booted. |
