import { test, expect } from '@playwright/test'
import { LoginPage } from '../pages/LoginPage'

test('signs in with valid credentials', async ({ page }) => {
  // PROVES: A user with valid credentials reaches the reports page.
  const login = new LoginPage(page)
  await login.goto('/login')
  await login.email.fill('user@example.com')
  await login.password.fill('correct-horse')
  await login.submit.click()
  await expect(page).toHaveURL(/\/reports/)
})
