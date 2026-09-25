# Before and after

Use these to calibrate how far an edit goes. Each "after" keeps the claim and changes only the delivery.

## Product announcement (personal register)

Before:
> We're thrilled to announce our cutting-edge caching layer, which serves as a testament to our commitment to performance. It empowers developers to streamline their workflows, delivering faster builds, lower costs, and happier teams.

After:
> We shipped a new caching layer. Cold builds on our main repo dropped from 9 minutes to 2. I didn't expect the cost savings to matter much, but our CI bill fell by a third.

What changed: cut "cutting-edge", "serves as a testament", "empowers", "streamline"; replaced the triad with the two measured results; added the author's reaction, which the original implied.

## README section (technical register, no soul pass)

Before:
> ## Getting Started With The CLI
> It's important to note that the CLI leverages a robust configuration system. This isn't just a config file. It's a flexible way to utilize environment-specific settings.

After:
> ## Getting started with the CLI
> The CLI reads settings from `cli.config.json` and lets you override any key per environment.

What changed: sentence-case heading; cut throat-clearing and the binary contrast; replaced "leverages a robust configuration system" with what it actually does. No first person or opinion added, since this is documentation.

## Report finding (third-person register)

Before:
> This vulnerability plays a crucial role in the overall security landscape of the application — it could potentially allow attackers to access sensitive data.

After:
> Any logged-in user can read other users' invoices by changing the ID in the URL.

What changed: removed the em dash, "plays a crucial role", "landscape", and the hedge; replaced the abstract risk with the concrete one. Severity and meaning unchanged.

## Already clean (leave it)

> The migration runs in two steps. First it copies rows to the new table, then it swaps the table names inside one transaction.

What changed: nothing. The scan found no tells and the rhythm is fine. Return clean text unchanged.
