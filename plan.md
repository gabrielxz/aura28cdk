Ticket: KAN-2
Title: Verify User's Birth Location

Requirements From Jira (verbatim, rendered)

## Business Goal

To enable accurate astrological calculations, we need to convert a user's local birth time into UTC. This requires knowing the precise geographic coordinates (latitude and longitude) and the IANA time zone of their place of birth. This feature will automatically find this information based on the location the user enters, improving the accuracy and value of our core features.

## User Story

"As a new user, when I enter my city, state, and country of birth during the sign-up process, I want the system to find its exact coordinates and time zone so my astrological chart can be calculated accurately and automatically."

## Functional Requirements

## 1. Location Input &amp; Verification

    - When a user enters their birth location, the input fields for City, State/Province, and Country must all be filled out before the system attempts to verify the location.

    - Once the required fields are filled and the user saves their profile, the system should automatically look up the location to find its latitude and longitude coordinates. The coordinates should be stored with a precision of at least 6 decimal places.

    - This verification should happen both when a new user signs up and when an existing user edits their birth location from their profile page.

    - The system should support international locations.

## 2. Time Zone Identification

    - Upon successfully identifying the latitude and longitude, the system must immediately determine the corresponding IANA time zone string (e.g., America/New_York).

    - This lookup should be performed on the backend using the tz-lookup NPM package to ensure it's fast and does not require external API calls.

    - The resulting time zone string must be saved and stored long-term, associated with the appropriate user.

## 3. Displaying Verified Data

    - Once the system successfully verifies a location, it should display a standardized, cleaned-up version of that location name on the user's profile page (e.g., in a non-editable field labeled "Verified Location").

## 4. User Feedback and Error Handling

    - The user interface should provide clear visual feedback (e.g., a loading spinner) while the location and time zone lookup is in progress.

    - If the system cannot recognize the entered location, a clear and friendly error message should be displayed.

    - To prevent abuse, users should be rate-limited on how many times they can change their location and trigger a new lookup within a 24-hour period.

## Notes and Constraints

    - Accuracy: The geocoding service does not need to be hyper-accurate. A service like AWS HERE that provides city-level accuracy is sufficient.

    - Performance: The service does not need to be highly performant, and at this stage, no caching is required.

    - Out of Scope for this feature:

    	- Cost monitoring or an administrative dashboard for this service.

    	- Displaying the location on a map (map visualization).

    	- Historical geopolitical resolution (i.e., we do not need to know what a country or city was called at the user's time of birth).

## Acceptance Criteria

    - Given a user is on the onboarding wizard or profile edit page

    - When they have filled out the City, State, and Country fields for their birth location and save their profile

    - Then the system attempts to find the geographic coordinates for that location.

    - And if successful, the system uses the coordinates to determine the IANA time zone.

    - And the latitude, longitude (with at least 6 decimal places), standardized location name, and IANA time zone string are all saved to the user's profile.

    - And the standardized location name is then displayed on their profile page.

    - And if the location cannot be found, an error message is shown to the user, and no location data is saved.

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
- [ ] PR created referencing KAN-2

DO NOT

- Do not modify files outside this plan’s scope
- Do not add dependencies unless justified and approved
- Do not rename directories or change package manager
- Do not change CI unless explicitly required by the ticket
