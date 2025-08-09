Ticket: <JIRA_KEY>
Title: <JIRA_SUMMARY>

Requirements From Jira (verbatim, rendered)
<INSERT_JIRA_DESCRIPTION_HERE>

Overview

- High-level approach and key decisions for addressing the Jira requirements.

Architecture & Design

- Major components/services to build or modify.
- Recommended patterns and why.
- Technology choices with justification.

Implementation Areas

- Which modules/layers need work and their responsibilities.
- Key integration points and data flow.

Data & API Strategy

- Data modeling approach and storage changes.
- API design principles and integration patterns.

Technical Considerations

- Performance, security, scalability, and risks.

Testing Strategy

- Types of tests and coverage areas; how to validate success.

\033[34mOpen Questions for Developer Decisions\033[0m

- Decisions intentionally left for developer to choose, if any.

\033[34mAdditional Suggestions (Not in Requirements)\033[0m

- Ideas beyond Jira requirements, clearly optional.

Done-When Checklist

- [ ] All Jira acceptance criteria satisfied (as stated in the Jira content above)
- [ ] Lint clean (`npm run lint`)
- [ ] Typecheck clean (`npx -w frontend tsc --noEmit`, `npx -w infrastructure tsc --noEmit`)
- [ ] Tests passing (`npm run test`)
- [ ] PR created referencing <JIRA_KEY>

DO NOT

- Do not modify files outside this plan’s scope
- Do not add dependencies unless justified and approved
- Do not rename directories or change package manager
- Do not change CI unless explicitly required by the ticket
