# Gitwix Digital Agency

A high-performance digital agency landing page featuring immersive 3D environments, hand-tracking navigation, and AI-driven interactions.

## Deployment

This project is deployed on Vercel with automatic Git integration.

1. **Push to GitHub**: Code is in the `gitwix-hands-website` repository.
2. **Vercel auto-deploys**: Every push to `main` triggers a production build.
3. **Environment Variables**: Configure in Vercel dashboard under Settings > Environment Variables.

## Tech Stack

- **React 19**
- **Three.js / React Three Fiber** (3D environments)
- **Framer Motion** (animations)
- **Tailwind CSS v4** (styling)
- **MediaPipe** (hand tracking)
- **AI Integration** (text refinement)

## Environment Variables

- `GEMINI_API_KEY`: Required for AI text refinement features.

## Features

- Hand gesture navigation (scroll, click, hover)
- 3D particle morphing sphere
- Voice input for forms
- AI-powered project description refinement
- Magnetic cursor snapping
- Responsive design
