# Strategic Implementation Plan: KAN-6 - Make Birth Time Field Mandatory

## ✅ Parsed Jira Facts

• Birth time field must be required during the onboarding flow (step 3)
• User cannot proceed to the next onboarding step without entering a birth time
• Birth time field must be required when editing profile in account settings
• Save button must be disabled in account settings if birth time is empty
• UI labels must no longer display "(optional)" text for birth time field
• Appropriate error message must display when user attempts to submit without birth time: "Birth time is required"
• Backend validation must reject profile updates without birth time
• API must return clear validation error when birth time is missing
• Frontend validation needed in: `/app/onboarding/page.tsx` and `/app/account-settings/page.tsx`
• Backend validation update needed in Lambda: `infrastructure/lambda/user-profile/update-user-profile.ts`
• Must ensure consistent validation between frontend and backend

## 🔐 Jira Fact Lock

• Birth time field is mandatory for all users
• Error message must be exactly: "Birth time is required"
• Frontend files to modify: `/app/onboarding/page.tsx` and `/app/account-settings/page.tsx`
• Backend file to modify: `infrastructure/lambda/user-profile/update-user-profile.ts`
• No changes to format or input method for birth time entry

## 🔗 Jira Mapping

• Step 3 validation enforcement → AC #1: Birth time field required during onboarding
• handleNext() validation → AC #2: User cannot proceed without birth time
• Account settings validation → AC #3: Birth time required in account settings
• Save button disable logic → AC #4: Save disabled if birth time empty
• Label text update → AC #5: Remove "(optional)" text
• Error message display → AC #6: Show "Birth time is required" error
• Lambda validateBirthData() → AC #7: Backend validation rejects missing birth time
• API error response → AC #8: API returns validation error

## 🚫 Out of Scope

• Changing the format or input method for birth time entry
• Adding timezone selection or advanced time input features

---

## 💡 Already-Answered in Jira

• Exact error message text: "Birth time is required"
• Specific files to modify (frontend and backend paths provided)
• Validation must be consistent between frontend and backend
• Current format (HH:MM 24-hour) remains unchanged

## 🟦 Open Questions for Developer Decisions

None.

## 🚀 Additional Suggestions (Not in Requirements)

None - treating birth time as a standard required field per requirements.

---

# Strategic Implementation Plan

## 🧭 Overview

Make birth time a required field for all user profiles. Update frontend validation to prevent form submission without birth time, modify backend to reject any profile updates missing birth time, and remove all "optional" indicators from the UI.

## 🏗️ Architecture & Design

**Components:**

- Onboarding form validation (step 3)
- Account settings form validation
- Lambda validation function
- Error display components

**Patterns:**

- Standard required field validation pattern
- Consistent error messaging
- Form validation on submit and next actions

**Technology Choices:**

- Existing React state validation
- TypeScript validation in Lambda
- No new dependencies

## 🔨 Implementation Areas

**Infrastructure (CDK):**

- No changes required

**Backend (API + Lambda):**

- Modify validateBirthData() to add birthTime to required field checks
- Return validation error with field name and message
- Maintain existing error response structure

**Frontend:**

- Add birth time validation to step 3 in onboarding validateStep()
- Remove "(optional)" text from labels
- Add birth time check to account settings validation
- Display error message when validation fails
- Disable save/next buttons when birth time empty

**Data Model:**

- No schema changes
- birthTime validation changes from optional to required

## 🔄 Data & API Strategy

Form submission → Validate all fields including birthTime → If missing, show "Birth time is required" error → Block submission → User enters birth time → Revalidate → Submit to API → Lambda validates → If missing, return 400 with error → Frontend displays error

## ⚠️ Technical Considerations

- **Performance:** No impact - simple validation check
- **Security:** No changes - birth time is non-sensitive
- **Data Consistency:** All new and updated profiles require birth time

## 🧪 Testing Strategy

**Unit Tests:**

- Test onboarding step 3 blocks progression without birth time
- Test account settings save disabled without birth time
- Test Lambda rejects requests missing birth time

**Integration Tests:**

- Test API returns proper validation error
- Test error message displays correctly

**E2E Tests:**

- Test complete onboarding flow requires birth time
- Test profile updates require birth time

---

# Senior Architectural Guidance

## Key Trade-offs

**Strict Validation:** Treat birth time identically to other required fields. No special cases, defaults, or workarounds.

## Data Contract

birthTime must be present and non-empty in all profile create/update requests. Format remains HH:MM (24-hour). Empty strings are invalid.

## Reliability

- **Validation Consistency:** Frontend and backend use identical validation logic
- **Error Handling:** Standard validation error format with field name and message

## Sequencing & Risk

1. Update backend validation
2. Update frontend validation and UI
3. Deploy together

Simple deployment - no migration or backwards compatibility needed.

## Edge Case Handling

- Empty string: Treat as missing field
- Whitespace only: Treat as missing field
- Invalid format: Existing format validation continues to apply

## Preferred Choices

1. **Simple validation** - Standard required field pattern
2. **Consistent enforcement** - Same rules for new and existing users
3. **Clear messaging** - Exact error text from requirements

---

## Implementation Checklist

### Frontend - Onboarding (`frontend/app/onboarding/page.tsx`)

- [ ] Update `validateStep()` case 3 to validate birth time is not empty
- [ ] Remove "(optional)" text from birth time label
- [ ] Add error display for birth time validation

### Frontend - Account Settings (`frontend/app/account-settings/page.tsx`)

- [ ] Add birth time validation to form submission
- [ ] Remove "(optional)" text from birth time label
- [ ] Disable save button when birth time is empty
- [ ] Display validation error message

### Backend - Lambda (`infrastructure/lambda/user-profile/update-user-profile.ts`)

- [ ] Update `validateBirthData()` to require birth time field
- [ ] Change validation from optional to required
- [ ] Return "Birth time is required" error message

### Tests

- [ ] Update onboarding tests to expect birth time validation
- [ ] Update Lambda tests to verify birth time requirement

---

## Compliance Gate

✅ All requirements mapped to implementation
✅ No scope creep beyond Jira requirements
✅ Error messages match exactly
✅ Files to modify clearly identified
✅ Validation consistency ensured
