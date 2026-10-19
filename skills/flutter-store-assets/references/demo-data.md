# Demo data

Demo mode replaces the install's local data with made-up data before the first screen is shown. It must never touch real data.

1. **Find the data layer.** Read the app's models (classes with `@HiveType`, `@JsonSerializable`, or plain data classes) and the repositories that save them. Note the box or table names and the ids they use.
2. **Find the entry points.** Read `main.dart`. Find the line after the local store and the prefs are opened and before `runApp`. The demo hook goes there, guarded by the `DEMO` define.
3. **Write the seed.** Fill each model with a small, realistic set:
   - names from more than one culture, with `example.com` emails
   - public test endpoints only (for example `test.mosquitto.org`), so live data is real but harmless
   - a few messages or rows per list, so every list looks used
4. **Make sign-in and sync inert.** Sign the demo user out, mark onboarding as seen, and stop any sync that would overwrite the seed with the account's data. Write the rule in a comment at the top of the file.
5. **Confirm with the user.** Show the seed as a short list of entities. Ask the user to confirm the names, the endpoints and the amounts before the first capture.

This is app code, written in the app behind the `capture.dartDefines` flag. No template ships with the skill and the tool holds none.
