# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security vulnerabilities.

- Preferred: use GitHub's private vulnerability reporting
  ("Security" tab → "Report a vulnerability") on this repository.
- Alternative: email **francois@chastel.co** with a description, reproduction steps,
  and impact assessment.

You can expect an acknowledgment within a few days. Please allow reasonable time for a
fix before any public disclosure.

## Scope

Once implementation lands, the following are in scope:

- The HighView web application and API
- Data ingestion pipelines and adapters
- Anything enabling access to non-public data, other users' uploads, or quota abuse

## Data-source operators

If you operate a data source referenced by this project (a state agency, government
portal, or API provider) and have concerns about how HighView accesses it, contact
**francois@chastel.co**. Per our own policy ([docs/LEGAL.md](./docs/LEGAL.md)), a
source operator's objection results in the corresponding adapter being disabled within
24 hours.

## Privacy issues

HighView is designed to hold **no personal information about vehicle owners**. If you
find any owner-identifying data in the project's outputs, datasets, or fixtures, report
it through the channels above — it is treated with the same severity as a security
vulnerability.
