# Strategic Implementation Plan: KAN-7

## Enable complete natal chart readings with house positions and angles

### ✅ Parsed Jira Facts

• Display all existing planetary positions (currently working)
• Calculate and display Ascendant (Rising sign) with degree position
• Calculate and display Midheaven (MC) with degree position
• Calculate all 12 house cusps with their zodiac positions
• Show which planets fall in which houses visually
• Store calculations permanently in database
• Base calculations on exact birth location coordinates and time
• Use Placidus house system (most commonly used)
• Accuracy within 1 degree of professional ephemeris tools
• Regenerate chart when user updates birth information
• Update stored chart data in database
• Immediately reflect changes in Natal Chart tab
• Integrate Swiss Ephemeris swetest binary for house calculations
• Combine existing planetary data with new house/angle data
• Birth time is now a required field in user profiles
• House calculations require precise geographic coordinates and time

### 🔐 Jira Fact Lock

• Must use Placidus house system only
• Birth time becomes mandatory field
• Swiss Ephemeris swetest binary integration required
• Accuracy must be within 1 degree
• All calculations stored permanently in database
• Updates trigger immediate regeneration

### 🔗 Jira Mapping

• Swetest integration → Technical Note #1
• Placidus system → AC #6 (house calculation requirement)
• Mandatory birth time → Technical Note #3
• Ascendant calculation → AC #1 (Rising sign display)
• Midheaven calculation → AC #1 (MC display)
• 12 house cusps → AC #1 (all house positions)
• Planet-house mapping → AC #1 (visual indication)
• Database storage → AC #5 (permanent storage)
• Regeneration on update → AC #9-11 (profile update flow)
• Coordinate precision → AC #6 (exact location requirement)

### 🚫 Out of Scope

• Astrological interpretations or readings of the house placements
• Alternative house systems (Koch, Equal, Whole Sign, etc.)
• Transit or progression calculations
• Synastry (relationship) charts
• PDF export functionality
• Mobile app visualization

### 💡 Already-Answered in Jira

• House system choice: Placidus only (no alternatives)
• Birth time handling: Required field, not optional
• Calculation library: Swiss Ephemeris swetest binary
• Storage strategy: Permanent in existing DynamoDB table
• Update behavior: Automatic regeneration on profile changes
• Accuracy requirement: Within 1 degree of professional tools

### 🟦 Developer Decisions (Resolved)

**Swetest deployment: Lambda Layer**

- Faster cold starts (files already mounted)
- Easier updates/versioning
- Keeps function zip small
- Multiple functions can reuse same binary + ephemeris files
- Constraint: Keep total layer (unzipped) < 250 MB

**House cusp display format**

- Store: Decimal degrees to 6 decimals (e.g., 123.456789)
- Display: Sign + degrees + minutes (e.g., 03°21′ Taurus)
- Reason: Precise storage, readable UI

**Visual planet-house mapping**

- Phase 1: Table view (planets, sign, degree, house) - ships fast, great for QA
- Phase 2: Circular chart as separate ticket (nice-to-have)

**Error handling for swetest failures**

- Retries: Up to 2 immediate retries (200ms / 500ms backoff)
- Fallback: If houses fail but planets available, return planets + set houses.status="failed"
- No silent fallback to Solar or noon charts
- Alerts: Log error + CloudWatch metric with alarm on error rate

### 🚀 Enhanced Implementation Decisions

**Calculation caching**

- Skip in-memory cache (Lambda container reuse unpredictable)
- Implement deterministic result cache in DynamoDB keyed by input hash
- Hash: {utcBirthISO, lat, lon, houseSystem, zodiacType, ephemerisVersion}
- If hash exists → return cached houses/angles instantly

**Calculation metadata**

- Store: algoVersion, ephemerisVersion, swetestVersion, input hash
- Add calculation timestamp for auditability
- Enables reproducibility and migration tracking

**Health monitoring**

- Scheduled CloudWatch canary running daily
- Execute swetest with fixed test chart
- Report to metric, no public endpoint needed

---

## 🧭 Overview

Enhance the existing natal chart system to calculate and display astrological houses and key angles (Ascendant/Midheaven) using Swiss Ephemeris swetest binary via Lambda Layer, with birth time as a mandatory field and deterministic caching for performance.

## 🏗️ Architecture & Design

### Components

- **Lambda Layer**: Swiss Ephemeris binary + ephemeris data files (< 250MB)
- **Enhanced Lambda**: generate-natal-chart with swetest integration
- **Cache Layer**: DynamoDB deterministic result cache
- **Frontend**: Enhanced natal chart display with house table

### Patterns

- Binary execution within Lambda via child process
- Deterministic caching by input hash
- Synchronous calculation pipeline with retries
- Structured logging for debugging

### Technology Stack

- Swiss Ephemeris swetest (Jira-mandated)
- Lambda Layer for binary distribution
- DynamoDB for result caching
- CloudWatch for monitoring

## 🔨 Implementation Areas

### Infrastructure (CDK)

- Create Lambda Layer with swetest binary + ephemeris files
- Update Lambda configuration:
  - Memory: 512MB minimum
  - Timeout: 10 seconds
  - Environment: EPHEMERIS_PATH=/opt/ephe
- Add DynamoDB cache table or extend existing
- CloudWatch canary for health checks

### Backend (Lambda + API)

**Swetest Integration Service**

- Input validation: lat ∈ [-90, 90], lon ∈ [-180, 180]
- UTC time conversion and Julian Day computation
- Command construction with Placidus flag
- Process execution with 3-second timeout
- Output parsing to structured data
- Debug logging of command (without PII)

**Data Model Enhancement**

```typescript
interface NatalChartData {
  // Existing
  userId: string;
  planets: PlanetData;

  // New
  houses: {
    status: 'success' | 'failed';
    data?: Array<{
      houseNumber: number; // 1-12
      cuspDegree: number; // 0-359.999999
      cuspSign: string; // e.g., "Aries"
      cuspDegreeInSign: number; // 0-29.999999
    }>;
    error?: string;
  };

  ascendant?: {
    degree: number; // 0-359.999999
    sign: string;
    degreeInSign: number;
    minutes: number; // for display
  };

  midheaven?: {
    degree: number;
    sign: string;
    degreeInSign: number;
    minutes: number;
  };

  planetHouses?: Record<string, number>; // planet → house number

  metadata: {
    calculationTimestamp: string;
    algoVersion: string;
    ephemerisVersion: string;
    swetestVersion: string;
    inputHash: string;
  };
}
```

**Cache Strategy**

- Generate hash from: {utcBirthISO, lat, lon, 'placidus', 'tropical', ephemerisVersion}
- Check cache before calculation
- Store successful calculations with TTL (30 days)
- Skip caching failed calculations

**Error Handling**

- Validate all inputs before swetest execution
- Retry logic: 2 retries with exponential backoff (200ms, 500ms)
- Timeout handling: Kill process after 3 seconds
- Error codes: SWETEST_TIMEOUT, SWETEST_PARSE_ERROR, SWETEST_EXEC_ERROR
- Return partial data (planets only) if houses fail

### Frontend Updates

**Profile Form**

- Make birth time required field
- Add validation for HH:MM format
- Clear error messaging for missing time

**Natal Chart Display**

- Table view with columns: Planet | Sign | Degree | House
- Separate sections for Ascendant and Midheaven
- House cusps list (1st House: 15°30′ Aries, etc.)
- Error state for failed house calculations
- Success indicator for complete charts

**Data Formatting**

- Store: Decimal degrees (6 decimals precision)
- Display: Sign + degrees + minutes (03°21′ Taurus)
- Derive display format client-side from decimal

## 🔄 Data Flow

1. User saves profile with birth time (required)
2. Lambda validates inputs (coordinates, time)
3. Check DynamoDB cache by input hash
4. If cached: return immediately
5. If not cached:
   - Execute swetest for houses/angles
   - Parse output to structured data
   - Calculate planet-house assignments
   - Store in cache with metadata
6. Combine with existing planet data
7. Save complete chart to main table
8. Return to frontend
9. Display in table format

## ⚠️ Technical Considerations

### Performance

- Target: < 3 seconds total calculation time
- Swetest execution: < 1 second typical
- Cache hit rate target: > 90% for returning users
- Lambda Layer cold start: ~500ms overhead

### Validation Requirements

- Coordinate bounds: lat ∈ [-90, 90], lon ∈ [-180, 180]
- Time format: ISO 8601 with timezone
- Birth date range: 1800-2100 (ephemeris data limits)
- Polar region handling for extreme latitudes

### Monitoring

- CloudWatch metrics:
  - swetest_execution_time
  - swetest_error_rate
  - cache_hit_rate
  - house_calculation_failures
- Alarms:
  - Error rate > 1%
  - P99 latency > 5 seconds
  - Daily canary failures

## 🧪 Testing Strategy

### Unit Tests

- Swetest command construction
- Output parsing logic
- House number assignment
- Coordinate validation
- Hash generation

### Integration Tests

- Lambda Layer loading
- Swetest binary execution
- DynamoDB cache operations
- Error retry logic
- Timeout handling

### E2E Tests

- Profile update → chart generation
- Cache hit scenarios
- Error fallback behavior
- Display formatting

### Validation Tests

- Compare with professional ephemeris (Swiss Ephemeris test suite)
- Verify 1-degree accuracy requirement
- Edge cases: polar regions, date boundaries
- Known test charts with expected values

## 🚀 Deployment Sequence

1. **Phase 1: Infrastructure**
   - Deploy Lambda Layer with swetest
   - Create/update DynamoDB cache table
   - Deploy CloudWatch canary

2. **Phase 2: Backend**
   - Update user profile validation (require birth time)
   - Deploy enhanced generate-natal-chart Lambda
   - Enable cache logic

3. **Phase 3: Frontend**
   - Update profile form validation
   - Deploy natal chart table view
   - Add error states

4. **Phase 4: Monitoring**
   - Enable CloudWatch alarms
   - Verify canary execution
   - Monitor cache hit rates

## 📊 Success Metrics

- All users with birth time see house positions
- 99% calculation success rate
- < 3 second P95 latency
- > 90% cache hit rate after warm-up
- Zero silent failures (all errors logged)
- Accuracy within 1 degree of reference ephemeris

## 🔒 Risk Mitigation

- **Feature flag**: Enable per environment/user group
- **Rollback plan**: Revert Lambda Layer, keep planets-only display
- **Degradation**: Show planets if houses fail
- **Cache poisoning**: Include version in hash, TTL limits impact
- **Binary compatibility**: Test on Lambda runtime before deploy

---

_Last Updated: 2025-01-10_
_Ticket: KAN-7_
_Status: Ready for Implementation_
