import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    specPattern: 'e2e/**/*.cy.js',
    supportFile: 'e2e/support/e2e.js',
    fixturesFolder: false,
    video: false,
    screenshotOnRunFailure: false,
  },
});
