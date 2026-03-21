---
name: Nimbus site — current status
description: What has been built, what is pending, and known issues for the Nimbus Tech Solutions website
type: project
---

## Site files
- `index.html` — Enterprise/technical landing page (dark theme, custom cursor, cloud burst easter egg)
- `boston-smb.html` — SMB landing page (light theme, Outfit+Work Sans fonts, no jargon)
- `privacy.html` — Privacy policy (cleaned up, Nimbus branding)
- `blog/cut-aws-bill-30-percent.html`
- `blog/hipaa-aws-checklist.html`
- `blog/kubernetes-vs-ecs-2026.html`
- `blog/smb-rag-pipeline-guide.html`
- `assets/css/style.css` — Shared stylesheet (enterprise page + cloud burst CSS)

## What's been done this session
- Removed names/company names from testimonials (kept initials + role + city)
- Fixed invisible mouse cursor on all blog pages and boston-smb.html and privacy.html (cursor: auto override)
- Both contact form + cloud burst popup now submit to Formspree (xjvnbjvn) → sidnigam.work@gmail.com
- Email (sid.nigam@outlook.com) hidden from all public display across all pages
- privacy.html rewritten — removed "Skin Insight" branding, cleaned dead commented code, updated footer
- boston-smb.html built from scratch: light design (sky blue palette, Outfit/Work Sans), hero with floating image, pain points, AI use cases (5 cards), AI readiness quiz/checklist, pricing ($299/$699), Website & SEO section, contact form with validation, cloud burst popup
- Cloud burst z-index raised to 500 on both pages (was 88 on enterprise, 0 on SMB) — now stays above hover cards
- Website & SEO / Lead Generation added: 5th service card on index.html, full section on boston-smb.html
- Services count updated from "Four" to "Five core disciplines" on index.html

## Remaining / not done yet
- **Custom domain** — currently at sidnigam.github.io/build, wants something enterprise (discussed nimbustechsolutions.com). Steps: buy domain → add DNS A records + CNAME → add CNAME file to repo → configure in GitHub Pages settings
- **No link from index.html to boston-smb.html** (or vice versa) — could add a subtle "For small businesses →" link somewhere
- **Blog pages have no back-navigation** to the main site beyond browser back button — no nav header on blog posts
- **No Google Analytics / tracking** — no visibility into who visits
- **No social proof on SMB page** — testimonials section is empty; main page has 3 testimonials (anonymized)
- **boston-smb.html not linked from the main nav** — visitors who land on index.html can't find the SMB page
- **All changes from this session are uncommitted** — needs a git commit + push to go live on GitHub Pages

## Known issues / watch out
- The `_replyto` Formspree hidden field may not override recipient — Formspree routes to the account owner's email. Sid should verify in Formspree dashboard that the account is registered with sidnigam.work@gmail.com
- Blog posts still use `../assets/css/style.css` which includes cursor:none — the override `* { cursor: auto !important; }` is added to each blog file's `<head>` to fix this
