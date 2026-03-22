# Known Issues

> Track bugs, tech debt, and problems discovered during sessions.
> Format: date discovered, description, severity, status (open/resolved/wontfix).

---

*No issues tracked yet.*

## 2026-03-22 — GitHub token lacks PR creation permissions
- **Severity**: low
- **Status**: resolved (2026-03-22)
- `gh pr create` fails with "Resource not accessible by personal access token"
- **Resolution**: User updated the personal access token with full repo permissions
