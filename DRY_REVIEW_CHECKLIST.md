# DRY Enforcement Review Checklist

Use this checklist at three cadences: `per PR`, `weekly/sprint`, and `monthly/quarterly`.
Mark each item as `Pass / Fail / N/A` and create a ticket for every `Fail`.

## Per PR (Merge Gate)

- [ ] New logic is not copied from another file without strong reason.
- [ ] Repeated logic appearing 2+ times is extracted or tracked for extraction.
- [ ] Business rules live in one canonical place (no duplicated rule implementations).
- [ ] No duplicated validation logic across handlers/controllers/services.
- [ ] Constants, enums, and error codes are centralized (no repeated magic values).
- [ ] Mapping/serialization code is reused (no repeated DTO/entity conversion blocks).
- [ ] Similar condition trees are abstracted into shared functions/policies.
- [ ] Shared utility use is preferred over ad hoc reimplementation.
- [ ] New abstractions are justified (avoids wrong abstraction from premature DRY).
- [ ] Tests avoid duplicated setup/assertion blocks where fixtures/helpers fit.
- [ ] Documentation/comments do not restate outdated copies of source truth.
- [ ] Reviewer explicitly answers: "Where else does this logic exist?"

## Weekly or Sprint Review

- [ ] Run clone/duplication detection tooling (for example, Sonar, PMD CPD, jscpd).
- [ ] No net increase in duplicate-line percentage week over week.
- [ ] Top 10 duplicated files/modules are reviewed and ranked by risk.
- [ ] Recent copy/paste hotspots are converted into reusable components.
- [ ] Similar bugs fixed in multiple places are traced to a missing abstraction.
- [ ] New shared helpers/modules are checked for actual reuse.
- [ ] Dead or near-duplicate utilities are removed.
- [ ] Repeated query fragments are centralized (views, query builders, shared SQL).
- [ ] Repeated config blocks across environments are templated/inherited.
- [ ] Repeated CI scripts/pipeline snippets are consolidated.
- [ ] Refactor backlog has owners and due dates.

## Monthly or Quarterly Review

- [ ] Domain model has one source of truth per core concept.
- [ ] API contract/schema definitions are centralized and code-generated where possible.
- [ ] Cross-service logic duplication is removed via shared library/service boundary changes.
- [ ] Frontend components/tokens are unified (no parallel component variants).
- [ ] Feature flags and permission rules are centralized.
- [ ] Error handling/retry/timeouts follow shared policy modules.
- [ ] Onboarding docs and runbooks reference canonical sources, not copied instructions.
- [ ] Utility graveyard cleanup removes overlapping helpers.
- [ ] Dependency wrappers are standardized to avoid repeated vendor-specific code.
- [ ] Architectural decision records capture when duplication is intentionally accepted.

## Metrics and Quality Gates

- [ ] Set a hard threshold for duplication percentage (overall and per module).
- [ ] Block merges that add duplicate blocks above threshold.
- [ ] Track duplication added vs removed each sprint.
- [ ] Track bugs caused by inconsistent duplicated logic.
- [ ] Track median time from duplicate detection to refactor completion.
- [ ] Include DRY adherence in team retro scorecards.

## Policy Checks (Healthy DRY)

- [ ] Apply Rule of Three before introducing shared abstractions.
- [ ] Prefer local duplication over brittle abstraction when context differs.
- [ ] Record intentional duplication with expiry/review date.
- [ ] Every shared module has an owner responsible for consistency.
