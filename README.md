# Gitwix Digital Agency

A high-performance digital agency landing page featuring immersive 3D environments and AI-driven interactions.

## 🚀 Vercel Deployment

To deploy this project to Vercel from GitHub:

1. **Push to GitHub**: Ensure your code is in a GitHub repository.
2. **Import to Vercel**: Go to [vercel.com/new](https://vercel.com/new) and select your repository.
3. **Configure Environment Variables**:
   - In the Vercel dashboard, go to **Settings > Environment Variables**.
   - Add `GEMINI_API_KEY` with your Google AI Studio API key.
4. **Deploy**: Click **Deploy**. Vercel will automatically detect the Vite configuration.

## 🛠 Tech Stack

- **React 19**
- **Three.js / React Three Fiber** (for 3D environments)
- **Framer Motion** (for animations)
- **Tailwind CSS** (for styling)
- **MediaPipe** (for hand tracking)
- **Google Gemini AI** (ready for integration)

## 🔑 Environment Variables

- `GEMINI_API_KEY`: Required for AI features.
- `APP_URL`: Automatically handled by Vercel/AI Studio.
