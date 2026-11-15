# StudyPoint frontend

Static StudyPoint interface using browser-native HTML, CSS, and JavaScript. It contains the explore, library, contribution, account, payment, and admin views. The published catalog starts empty and fills with member uploads after admin approval.

## Deploy on Vercel

1. Import `miclovesellie-alt/studypoint_frontend` as a new Vercel project.
2. Select **Other** as the Framework Preset. Leave Build Command blank and serve the repository root as the output directory.
3. Deploy once, then add the custom subdomain you own under Project Settings → Domains. Add the CNAME record Vercel displays at your DNS provider and wait for Vercel to verify it and provision HTTPS.
4. After the Render backend is deployed, set `window.STUDYPOINT_API_URL` in a small script in `index.html`, before `app.js` loads, to the backend HTTPS URL. If you attach an API subdomain on the same domain as the Vercel subdomain, use that API subdomain here. Commit the change; Vercel will redeploy from Git.
5. In Render, set `STUDYPOINT_FRONTEND_URL` and `STUDYPOINT_ALLOWED_ORIGIN` to the exact Vercel custom domain origin. Keep API and Paystack secrets on the backend only.

The API uses credentialed requests for account sessions, so the Vercel and Render origins must both use HTTPS. Configure the backend's origin to exactly match the frontend domain.

