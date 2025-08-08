import json
import re
from playwright.sync_api import sync_playwright, Page, expect

def run_verification(page: Page):
    """
    This script verifies the location geocoding feature on the account settings page.
    It injects a dummy auth token and mocks all necessary backend API responses
    (profile GET, profile PUT, and Cognito token refresh) to run the test in isolation.
    """
    dummy_user_id = "dummy-user-123"

    # --- Arrange: Mock Data ---
    dummy_auth_token = {
        "idToken": f"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ{dummy_user_id}\",\"ZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWV9.dummy_signature",
        "accessToken": "dummy_access_token",
        "refreshToken": "dummy_refresh_token",
        "expiresAt": 9999999999999
    }

    initial_profile_response = {
        "userId": dummy_user_id, "createdAt": "PROFILE", "email": "test@example.com",
        "profile": {
            "birthName": "Jane Doe", "birthDate": "1995-05-20",
            "birthCity": "Old City", "birthState": "Old State", "birthCountry": "Old Country"
        }, "onboardingCompleted": True
    }

    updated_profile_response = {
        "message": "Profile updated successfully",
        "profile": {
            "userId": dummy_user_id, "profile": {
                "standardizedLocationName": "Paris, Île-de-France, France"
            }
        }
    }

    token_refresh_response = {
        "id_token": "new_dummy_id_token",
        "access_token": "new_dummy_access_token",
        "expires_in": 3600
    }

    # --- Arrange: Intercept API Calls ---
    def handle_route(route):
        request_url = route.request.url
        if "oauth2/token" in request_url:
            print("Intercepted POST /oauth2/token")
            route.fulfill(status=200, content_type="application/json", body=json.dumps(token_refresh_response))
        elif f"/api/users/{dummy_user_id}/profile" in request_url:
            if route.request.method == "GET":
                print("Intercepted GET /profile")
                route.fulfill(status=200, content_type="application/json", body=json.dumps(initial_profile_response))
            elif route.request.method == "PUT":
                print("Intercepted PUT /profile")
                route.fulfill(status=200, content_type="application/json", body=json.dumps(updated_profile_response))
        else:
            route.continue_()

    page.route("**/*", handle_route)

    # --- Act & Assert ---
    page.goto("http://localhost:3000")
    page.evaluate(
        "([key, value]) => localStorage.setItem(key, value)",
        ["aura28_auth_tokens", json.dumps(dummy_auth_token)]
    )
    page.goto("http://localhost:3000/account-settings")

    expect(page.get_by_role("heading", name="Account Settings")).to_be_visible(timeout=10000)

    page.get_by_label("City").fill("Paris")
    page.get_by_label("State/Province").fill("Ile-de-France")
    page.get_by_label("Country").fill("France")
    page.get_by_role("button", name="Save Changes").click()

    verified_location_input = page.get_by_label("Verified Location")
    expect(verified_location_input).to_be_visible(timeout=15000)
    expect(verified_location_input).to_have_value("Paris, Île-de-France, France")

    page.screenshot(path="jules-scratch/verification/verification.png")
    print("Verification script completed and screenshot taken.")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        run_verification(page)
        browser.close()

if __name__ == "__main__":
    main()
