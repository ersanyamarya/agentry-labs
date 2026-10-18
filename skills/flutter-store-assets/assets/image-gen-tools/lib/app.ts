/**
 * Everything specific to the app being captured. The setup step fills these placeholders; nothing else in the tool
 * should name the app.
 */
/** Shown in the wordmark and the share card, e.g. "Acme". */
export const APP_NAME = "{{APP_NAME}}";
/** Dart package name from pubspec.yaml, e.g. "acme_app". Used in import paths and output folder names. */
export const APP_PACKAGE = "{{APP_PACKAGE}}";
/** Flutter app folder, relative to the repo root, e.g. "apps/acme_app". */
export const APP_DIR = "{{APP_DIR}}";
/** Process name of the macOS app (PRODUCT_NAME in macos/Runner/Configs/AppInfo.xcconfig). */
export const MAC_PROCESS = "{{MAC_PROCESS}}";
