# Choosing the screens

The store set is an ordered list of screens. Each screen becomes one card per platform, so the list controls the length of every store set. Stores allow 10 per device size (Play allows 8 per phone or tablet slot), so keep the list within those limits.

1. Read the router files from `routerFiles`, and list each route path with the page widget it builds.
2. Put the list to the user with the route and a one-line description. Ask which screens to include and in what order.
3. Ask whether any screen is not ready to ship. Leave those out.
4. Give each screen a slug (for example `broker-config`). The slug names the captured file, so keep it stable.

Use the same list for every platform. A platform that cannot show a screen should be skipped there, not replaced.
