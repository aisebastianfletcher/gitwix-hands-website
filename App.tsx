import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Hands, Results, HAND_CONNECTIONS } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

// --- Constants ---
const PINCH_THRESHOLD = 0.06;
const SCROLL_SPEED = 3;

// --- Components ---

const HandVisualizer = ({ landmarks }: { landmarks: any }) => {
  if (!landmarks) return null;

  return (
    <svg viewBox="0 0 1 1" className="fixed inset-0 w-full h-full pointer-events-none z-50">
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="0.01" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      
      {/* Skeleton */}
      {HAND_CONNECTIONS.map(([a, b], i) => (
        <line
          key={i}
          x1={1 - landmarks[a].x}
          y1={landmarks[a].y}
          x2={1 - landmarks[b].x}
          y2={landmarks[b].y}
          stroke="#00FFFF"
          strokeWidth="0.005"
          strokeLinecap="round"
          filter="url(#glow)"
          className="opacity-60"
        />
      ))}

      {/* Joints */}
      {landmarks.map((point: any, i: number) => (
        <circle
          key={i}
          cx={1 - point.x}
          cy={point.y}
          r={i === 4 || i === 8 ? 0.012 : 0.006}
          fill={i === 4 || i === 8 ? '#FFFFFF' : '#00FFFF'}
          filter="url(#glow)"
          className="opacity-80"
        />
      ))}
    </svg>
  );
};

export default function App() {
  // --- State ---
  const [view, setView] = useState<'intro' | 'tutorial' | 'website'>('intro');
  const [handDetected, setHandDetected] = useState(false);
  const [landmarks, setLandmarks] = useState<any>(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [pinchProgress, setPinchProgress] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);

  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevHandY = useRef<number | null>(null);
  const lastClickTime = useRef(0);
  const orbRef = useRef<HTMLDivElement>(null);
  const demoOrbRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);

  // Keep viewRef in sync
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // --- Hand Tracking Logic ---
  useEffect(() => {
    let camera: Camera | null = null;
    let isActive = true;

    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    hands.onResults((results: Results) => {
      if (!isActive) return;
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        setHandDetected(true);
        const pts = results.multiHandLandmarks[0];
        setLandmarks(pts);

        // 1. Cursor Position (Index Tip)
        const target = pts[8];
        let targetX = (1 - target.x) * window.innerWidth;
        let targetY = target.y * window.innerHeight;

        // Magnetic Snapping for Orbs
        const checkSnap = (ref: React.RefObject<HTMLDivElement>) => {
          if (ref.current) {
            const rect = ref.current.getBoundingClientRect();
            const orbCenterX = rect.left + rect.width / 2;
            const orbCenterY = rect.top + rect.height / 2;
            const distToOrb = Math.sqrt((targetX - orbCenterX)**2 + (targetY - orbCenterY)**2);
            
            if (distToOrb < 150) {
              const snapFactor = 1 - (distToOrb / 150);
              targetX = targetX + (orbCenterX - targetX) * snapFactor;
              targetY = targetY + (orbCenterY - targetY) * snapFactor;
              return true;
            }
          }
          return false;
        };

        if (viewRef.current === 'intro') {
          checkSnap(orbRef);
        } else if (viewRef.current === 'tutorial') {
          checkSnap(demoOrbRef);
        }

        setCursorPos({ x: targetX, y: targetY });

        // 2. Gesture Detection
        const isFingerExtended = (tipIdx: number, knuckleIdx: number) => pts[tipIdx].y < pts[knuckleIdx].y;
        const indexExtended = isFingerExtended(8, 5);
        const middleExtended = isFingerExtended(12, 9);
        const ringExtended = isFingerExtended(16, 13);
        const pinkyExtended = isFingerExtended(20, 17);
        const extendedCount = [indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;

        // Scroll Logic: Hand Open (>= 3 fingers)
        if (extendedCount >= 3) {
          setIsScrolling(true);
          const currentY = pts[9].y; // Middle knuckle for stable Y
          if (prevHandY.current !== null) {
            const deltaY = (currentY - prevHandY.current) * window.innerHeight * SCROLL_SPEED;
            if (Math.abs(deltaY) > 2) {
              window.scrollBy(0, deltaY);
            }
          }
          prevHandY.current = currentY;
        } else if (extendedCount === 0) {
          // Fist: Stop Scroll
          setIsScrolling(false);
          prevHandY.current = null;
        } else {
          prevHandY.current = null;
        }

        // 3. Pinch Detection (Thumb Tip to Index Tip)
        const thumb = pts[4];
        const index = pts[8];
        const dist = Math.sqrt((thumb.x - index.x)**2 + (thumb.y - index.y)**2);
        const progress = Math.max(0, Math.min(1, 1 - (dist / 0.1)));
        setPinchProgress(progress);

        if (dist < PINCH_THRESHOLD) {
          const now = Date.now();
          if (now - lastClickTime.current > 1000) {
            const checkPinch = (ref: React.RefObject<HTMLDivElement>, callback: () => void) => {
              if (ref.current) {
                const rect = ref.current.getBoundingClientRect();
                const orbCenterX = rect.left + rect.width / 2;
                const orbCenterY = rect.top + rect.height / 2;
                const d = Math.sqrt((targetX - orbCenterX)**2 + (targetY - orbCenterY)**2);
                if (d < 120) {
                  callback();
                  return true;
                }
              }
              return false;
            };

            if (viewRef.current === 'intro') {
              if (!checkPinch(orbRef, () => setView('tutorial'))) {
                const element = document.elementFromPoint(targetX, targetY);
                if (element instanceof HTMLElement) element.click();
              }
            } else if (viewRef.current === 'tutorial') {
              if (!checkPinch(demoOrbRef, () => setView('website'))) {
                const element = document.elementFromPoint(targetX, targetY);
                if (element instanceof HTMLElement) element.click();
              }
            } else if (viewRef.current === 'website') {
              const element = document.elementFromPoint(targetX, targetY);
              if (element instanceof HTMLElement) element.click();
            }
            lastClickTime.current = now;
          }
        }
      } else {
        setHandDetected(false);
        setLandmarks(null);
        setPinchProgress(0);
        setIsScrolling(false);
        prevHandY.current = null;
      }
    });

    if (videoRef.current) {
      camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current && isActive) {
            try {
              await hands.send({ image: videoRef.current });
            } catch (e) {
              console.error("MediaPipe send error:", e);
            }
          }
        },
        width: 640,
        height: 480,
      });
      camera.start();
    }

    return () => {
      isActive = false;
      if (camera) {
        camera.stop();
      }
      hands.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-cyan-500/30">
      {/* Vision Core (Camera Feed) */}
      <div className="fixed bottom-8 right-8 w-48 h-36 rounded-2xl bg-black overflow-hidden shadow-2xl z-40">
        <video ref={videoRef} className="w-full h-full object-cover opacity-0" playsInline muted />
        
        {/* Local Hand Visualizer for Webcam Box */}
        <div className="absolute inset-0 pointer-events-none">
          <HandVisualizer landmarks={landmarks} />
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute top-2 left-2 flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${handDetected ? 'bg-cyan-400 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-[8px] font-black uppercase tracking-widest opacity-60">AI Vision</span>
        </div>
      </div>

      {/* Hand Skeleton Visualizer */}
      <HandVisualizer landmarks={landmarks} />

      {/* Virtual Cursor */}
      <motion.div 
        className="fixed w-4 h-4 -ml-2 -mt-2 border-2 border-white rounded-full pointer-events-none z-[100]"
        animate={{ x: cursorPos.x, y: cursorPos.y, scale: pinchProgress > 0.5 ? 0.5 : 1 }}
        transition={{ type: 'spring', stiffness: 1000, damping: 50 }}
      />

      <AnimatePresence mode="wait">
        {view === 'intro' ? (
          <motion.div 
            key="intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-32 items-center max-w-6xl w-full">
              {/* Option 1: Regular Navigation */}
              <div className="flex flex-col items-center gap-8 order-2 md:order-1">
                <div className="w-32 h-32 rounded-2xl border border-white/10 flex items-center justify-center bg-white/5">
                  <div className="w-8 h-12 border-2 border-white/40 rounded-full relative">
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1 h-2 bg-white/40 rounded-full animate-bounce" />
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-xl font-black uppercase tracking-widest">Standard Mode</h3>
                  <p className="text-[10px] text-white/40 uppercase tracking-[0.3em] max-w-[200px]">Use your mouse or trackpad to navigate</p>
                </div>
                <button 
                  onClick={() => setView('website')}
                  className="px-8 py-3 bg-white text-black font-black uppercase text-[10px] tracking-[0.3em] rounded-full hover:scale-105 transition-transform"
                >
                  Enter Website
                </button>
              </div>

              {/* Option 2: Vision Navigation */}
              <div className="flex flex-col items-center gap-8 order-1 md:order-2">
                <div className="relative group" ref={orbRef}>
                  <motion.div 
                    animate={{ 
                      scale: [1, 1.1, 1],
                      boxShadow: pinchProgress > 0.5 ? `0 0 ${pinchProgress * 50}px rgba(34,211,238,0.5)` : 'none'
                    }}
                    transition={{ 
                      scale: { duration: 4, repeat: Infinity },
                      boxShadow: { duration: 0.1 }
                    }}
                    className="w-32 h-32 rounded-full border border-white/20 flex items-center justify-center relative cursor-pointer"
                    onClick={() => setView('tutorial')}
                  >
                    <div className="absolute inset-0 rounded-full border border-cyan-400/30 animate-pulse" />
                    
                    {/* Pinch Progress Ring */}
                    <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
                      <circle
                        cx="64"
                        cy="64"
                        r="60"
                        fill="none"
                        stroke="rgba(34,211,238,0.2)"
                        strokeWidth="2"
                      />
                      <motion.circle
                        cx="64"
                        cy="64"
                        r="60"
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth="4"
                        strokeDasharray="377"
                        animate={{ strokeDashoffset: 377 * (1 - pinchProgress) }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      />
                    </svg>

                    <div className="w-4 h-4 bg-white rounded-full shadow-[0_0_20px_rgba(255,255,255,0.5)]" />
                  </motion.div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-xl font-black uppercase tracking-widest text-cyan-400">Tutorial</h3>
                  <div className="flex flex-col items-center gap-1 opacity-40">
                    <p className="text-[8px] uppercase tracking-[0.4em]">hand open scroll</p>
                    <p className="text-[8px] uppercase tracking-[0.4em]">hand closed stop scroll</p>
                    <p className="text-[8px] uppercase tracking-[0.4em]">pinch to click</p>
                  </div>
                </div>
                <p className="text-[10px] uppercase tracking-[0.5em] text-cyan-400/60 animate-pulse">Pinch Orb to Enter</p>
              </div>
            </div>
          </motion.div>
        ) : view === 'tutorial' ? (
          <motion.div 
            key="tutorial"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-4xl mx-auto py-32 px-6"
          >
            <header className="mb-32">
              <h1 className="text-8xl font-black uppercase tracking-tighter mb-8">Tutorial</h1>
              <p className="text-xl text-white/40 uppercase tracking-widest">Master the vision controls.</p>
            </header>

            <div className="space-y-64">
              <section>
                <h2 className="text-4xl font-bold uppercase mb-8">01. Scrolling</h2>
                <p className="text-lg text-white/60 leading-relaxed max-w-xl">
                  Open your hand and move it up or down. The interface responds to your vertical motion with fluid momentum.
                </p>
              </section>

              <section>
                <h2 className="text-4xl font-bold uppercase mb-8">02. Precision Stop</h2>
                <p className="text-lg text-white/60 leading-relaxed max-w-xl">
                  Clench your fist to immediately freeze the scroll. This allows for precise navigation through dense content.
                </p>
              </section>

              <section className="pb-64">
                <h2 className="text-4xl font-bold uppercase mb-8">03. Interaction</h2>
                <p className="text-lg text-white/60 leading-relaxed max-w-xl mb-12">
                  Pinch your thumb and index finger to interact with elements. Try pinching the orb below to enter the website.
                </p>
                <div className="relative group w-fit" ref={demoOrbRef}>
                  <motion.div 
                    animate={{ 
                      scale: [1, 1.1, 1],
                      boxShadow: pinchProgress > 0.5 ? `0 0 ${pinchProgress * 50}px rgba(34,211,238,0.5)` : 'none'
                    }}
                    transition={{ 
                      scale: { duration: 4, repeat: Infinity },
                      boxShadow: { duration: 0.1 }
                    }}
                    className="w-32 h-32 rounded-full border border-white/20 flex items-center justify-center relative cursor-pointer"
                    onClick={() => setView('website')}
                  >
                    <div className="absolute inset-0 rounded-full border border-cyan-400/30 animate-pulse" />
                    
                    {/* Pinch Progress Ring */}
                    <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
                      <circle
                        cx="64"
                        cy="64"
                        r="60"
                        fill="none"
                        stroke="rgba(34,211,238,0.2)"
                        strokeWidth="2"
                      />
                      <motion.circle
                        cx="64"
                        cy="64"
                        r="60"
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth="4"
                        strokeDasharray="377"
                        animate={{ strokeDashoffset: 377 * (1 - pinchProgress) }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      />
                    </svg>

                    <div className="w-4 h-4 bg-white rounded-full shadow-[0_0_20px_rgba(255,255,255,0.5)]" />
                  </motion.div>
                </div>
              </section>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="website"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full"
          >
            {/* Navigation */}
            <nav className="fixed top-0 left-0 w-full p-8 flex justify-between items-center z-30 bg-black/50 backdrop-blur-md border-b border-white/5">
              <div className="text-xl font-black uppercase tracking-tighter">Vision.OS</div>
              <div className="flex gap-8">
                {['Work', 'About', 'Contact'].map(item => (
                  <button key={item} className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 hover:opacity-100 transition-opacity">
                    {item}
                  </button>
                ))}
                <button 
                  onClick={() => setView('intro')}
                  className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400"
                >
                  Exit
                </button>
              </div>
            </nav>

            {/* Hero Section */}
            <section className="h-screen flex flex-col items-center justify-center text-center px-6">
              <motion.h1 
                initial={{ y: 50, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                className="text-[15vw] font-black uppercase leading-[0.8] tracking-tighter mb-12"
              >
                Future<br/>Vision
              </motion.h1>
              <p className="text-xl text-white/40 uppercase tracking-[0.5em] max-w-2xl">
                The next generation of spatial computing interfaces.
              </p>
            </section>

            {/* Content Grid */}
            <section className="max-w-7xl mx-auto py-32 px-6 grid grid-cols-1 md:grid-cols-2 gap-24">
              {[
                { title: 'Spatial Design', desc: 'Interfaces that live in your world, not on your screen.' },
                { title: 'Natural Input', desc: 'Control everything with the most intuitive tool: your hands.' },
                { title: 'Infinite Canvas', desc: 'Break free from the boundaries of traditional displays.' },
                { title: 'AI Integration', desc: 'Context-aware intelligence that anticipates your needs.' }
              ].map((item, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="group cursor-pointer"
                >
                  <div className="aspect-video bg-white/5 rounded-3xl border border-white/10 mb-8 overflow-hidden relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <h3 className="text-2xl font-black uppercase tracking-widest mb-4">{item.title}</h3>
                  <p className="text-white/40 leading-relaxed">{item.desc}</p>
                </motion.div>
              ))}
            </section>

            {/* Footer */}
            <footer className="py-32 px-6 border-t border-white/5 text-center">
              <h2 className="text-4xl font-black uppercase tracking-widest mb-12">Ready to evolve?</h2>
              <button className="px-12 py-4 bg-white text-black font-black uppercase text-xs tracking-[0.4em] rounded-full hover:scale-110 transition-transform">
                Get Started
              </button>
              <div className="mt-32 text-[8px] uppercase tracking-[0.5em] opacity-20">
                © 2026 Vision.OS — All rights reserved
              </div>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status Indicators */}
      <div className="fixed bottom-8 left-8 flex items-center gap-4 opacity-20">
        <div className={`w-2 h-2 rounded-full ${handDetected ? 'bg-cyan-400' : 'bg-red-500'}`} />
        <span className="text-[8px] font-black uppercase tracking-widest">
          {handDetected ? 'Tracking' : 'Searching'}
        </span>
        {isScrolling && <span className="text-[8px] font-black uppercase tracking-widest text-cyan-400">Scrolling</span>}
      </div>
    </div>
  );
}
