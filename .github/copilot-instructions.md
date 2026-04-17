# Project Rules — innogarage.ai

## Testing & Installation
- Do **not** install or run the app directly from the terminal.
- Always test the application using the `.dmg` file downloaded from the GitHub release only.

## On Any Code Change
1. Create an updated `.dmg` build (`npm run build:mac`).
2. Install it locally (`npm run install:mac`).
3. **Inform the user** that a new `.dmg` file has been created.
4. **Ask the user** to update/upload it in the GitHub release.

## On Server Dependency Changes
1. Push the changes required for deployment (`git add -A && git commit && git push origin main`).
2. **Inform the user** that server dependency changes were pushed to Railway.

## Communication Requirements
Always clearly communicate:
- When a new `.dmg` file has been created and needs to be uploaded to GitHub release.
- When server dependency or code changes were pushed for Railway deployment.
