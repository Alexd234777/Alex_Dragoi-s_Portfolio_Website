# Alex Dragoi Portfolio

Fast static portfolio served by Express with a validated contact form.

## Local development

```bash
npm install
npm run check
npm start
```

Open `http://localhost:3000`.

## Render deployment

Recommended settings:

- Plan: Free
- Public URL: use the generated `onrender.com` URL until you buy a custom domain
- Build command: `npm ci`
- Start command: `npm start`
- Node version: Render's default Node 18+ runtime is fine
- Environment: `NODE_ENV=production`

If the existing Render service still has an old manual start command, set it to either `npm start` or `node server.js`. A compatibility `Server.js` entrypoint is also included for older case-sensitive Render settings.

## Contact form environment variables

Set these in Render before relying on the contact form:

- `GMAIL_USER`: Gmail address used to send messages.
- `GMAIL_APP_PASSWORD`: Gmail app password, not the normal account password.
- `CONTACT_TO`: optional recipient address. Defaults to `GMAIL_USER`.

The server also accepts the legacy `GMAIL_PASS` name, but `GMAIL_APP_PASSWORD` is clearer.

## Creating the Gmail app password

1. Turn on 2-Step Verification for the Gmail account that will send contact-form emails.
2. Open Google Account App Passwords.
3. Create a new app password for this portfolio website.
4. Copy the 16-character password once. Google only shows it at creation time.
5. In Render, open the portfolio service, go to Environment, and add `GMAIL_APP_PASSWORD` with that value.
6. Add `GMAIL_USER` with the same Gmail address and `CONTACT_TO` with the inbox where client inquiries should arrive.
7. Choose Save, rebuild, and deploy.
