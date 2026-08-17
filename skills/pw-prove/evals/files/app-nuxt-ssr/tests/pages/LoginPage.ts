import { BasePage } from './BasePage'
import type { Page } from '@playwright/test'

export class LoginPage extends BasePage {
  readonly email = this.page.getByPlaceholder('you@example.com')
  readonly password = this.page.getByPlaceholder('Password')
  readonly submit = this.page.getByRole('button', { name: 'Sign in' })
  constructor(page: Page) { super(page) }
}
