from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        page.goto("http://localhost:3002/onboarding", timeout=60000)
        page.wait_for_load_state('networkidle')
        page.screenshot(path="jules-scratch/verification/onboarding_simple.png")
        print(f"Successfully navigated to {page.url}")
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
