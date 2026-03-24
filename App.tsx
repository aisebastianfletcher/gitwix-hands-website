import { GoogleGenAI } from "@google/genai";
import React, { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, Text, MeshDistortMaterial, Sphere, PerspectiveCamera, Environment, useScroll as useThreeScroll, ScrollControls, Scroll, Stars } from '@react-three/drei';
import { Hands, Results, HAND_CONNECTIONS } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { Loader2, MousePointer2, Hand, ArrowDown, Sparkles, Globe, Layers, Mail, Activity, Zap, Shield, ArrowRight, ChevronRight, Play, ExternalLink, Volume2 } from 'lucide-react';
import { motion, AnimatePresence, useScroll, useSpring, useTransform } from 'motion/react';

// --- CONSTANTS ---
const PINCH_THRESHOLD = 0.04;
const SCROLL_SENSITIVITY = 5; 
const CURSOR_SMOOTHING = 0.1; 
const SCROLL_SMOOTHING = 0.04; 
const TRACKING_LOST_TIMEOUT = 1000; 
const CURSOR_RANGE_SCALE = 1.8; 
const MAGNETIC_RADIUS = 100; // Radius in pixels for magnetic click
const STAR_COUNT = 1000;
const HAND_HOVER_CLASS = 'hand-hover';

type Page = 'home' | 'services' | 'portfolio' | 'book';

const PAGE_COLORS: Record<Page, string> = {
  home: '#00ffff',
  services: '#ff00ff',
  portfolio: '#ffcc00',
  book: '#00ff88'
};

// --- THREE.JS COMPONENTS ---

function MorphingSphere({ scrollProgress, cursorPos, targetColor }: { scrollProgress: any, cursorPos: { x: number, y: number }, targetColor: string }) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const count = 15000; // Even more particles for ultra-HD look
  
  const currentColor = useRef(new THREE.Color('#00ffff'));
  const lerpColor = useRef(new THREE.Color('#00ffff'));

  const [positions, spherePositions, randomPositions] = React.useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sphere = new Float32Array(count * 3);
    const random = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
      // Sphere positions (Golden Ratio Spiral)
      const phi = Math.acos(-1 + (2 * i) / count);
      const theta = Math.sqrt(count * Math.PI) * phi;
      
      // Start as a smaller, denser ball
      const radius = 8; 
      sphere[i * 3] = radius * Math.cos(theta) * Math.sin(phi);
      sphere[i * 3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
      sphere[i * 3 + 2] = radius * Math.cos(phi);
      
      // Random dispersed positions (Expanding cloud)
      random[i * 3] = (Math.random() - 0.5) * 180;
      random[i * 3 + 1] = (Math.random() - 0.5) * 180;
      random[i * 3 + 2] = (Math.random() - 0.5) * 180;
      
      // Initial
      pos[i * 3] = sphere[i * 3];
      pos[i * 3 + 1] = sphere[i * 3 + 1];
      pos[i * 3 + 2] = sphere[i * 3 + 2];
    }
    return [pos, sphere, random];
  }, []);

  useFrame((state) => {
    if (!pointsRef.current || !materialRef.current) return;
    const t = state.clock.getElapsedTime();
    const s = scrollProgress.get();
    const posAttr = pointsRef.current.geometry.attributes.position;
    
    // Smooth color transition
    lerpColor.current.set(targetColor);
    currentColor.current.lerp(lerpColor.current, 0.05);
    materialRef.current.color.copy(currentColor.current);

    // Mouse/Hand interaction
    const mx = (cursorPos.x / window.innerWidth - 0.5) * 40;
    const my = -(cursorPos.y / window.innerHeight - 0.5) * 40;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      
      // Interpolate between sphere and random based on scroll
      // Use a power function for a more dramatic "explosion" effect
      const t_scroll = Math.pow(s, 1.8);
      const targetX = THREE.MathUtils.lerp(spherePositions[i3], randomPositions[i3], t_scroll);
      const targetY = THREE.MathUtils.lerp(spherePositions[i3 + 1], randomPositions[i3 + 1], t_scroll);
      const targetZ = THREE.MathUtils.lerp(spherePositions[i3 + 2], randomPositions[i3 + 2], t_scroll);
      
      // Interaction force (repel)
      const dx = posAttr.array[i3] - mx;
      const dy = posAttr.array[i3 + 1] - my;
      const distSq = dx*dx + dy*dy;
      const dist = Math.sqrt(distSq);
      const force = Math.max(0, (10 - dist) * 0.03);
      
      posAttr.array[i3] += (targetX + dx * force - posAttr.array[i3]) * 0.1;
      posAttr.array[i3 + 1] += (targetY + dy * force - posAttr.array[i3 + 1]) * 0.1;
      posAttr.array[i3 + 2] += (targetZ - posAttr.array[i3 + 2]) * 0.1;
    }
    
    posAttr.needsUpdate = true;
    pointsRef.current.rotation.y = t * 0.05 + s * 0.8;
    pointsRef.current.rotation.z = t * 0.02 + s * 0.3;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        size={0.06}
        color="#00ffff"
        transparent
        opacity={0.9}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

function Scene({ scrollProgress, cursorPos, currentPage }: { scrollProgress: any, cursorPos: { x: number, y: number }, currentPage: Page }) {
  const { camera } = useThree();
  const targetColor = PAGE_COLORS[currentPage] || '#00ffff';
  
  useFrame((state) => {
    const s = scrollProgress.get();
    const t = state.clock.getElapsedTime();
    
    // Camera moves back and slightly up as we scroll
    camera.position.z = THREE.MathUtils.lerp(35, 70, s);
    camera.position.y = THREE.MathUtils.lerp(0, 15, s) + Math.sin(t * 0.3) * 1;
    camera.position.x = Math.cos(t * 0.2) * 2;
    camera.lookAt(0, 0, 0);
  });

  return (
    <>
      <Environment preset="night" />
      <ambientLight intensity={0.2} />
      <pointLight position={[30, 30, 30]} intensity={3} color={targetColor} />
      <pointLight position={[-30, -30, -30]} intensity={1.5} color="#ff00ff" />
      
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      
      <MorphingSphere scrollProgress={scrollProgress} cursorPos={cursorPos} targetColor={targetColor} />

      <fog attach="fog" args={["#000", 40, 120]} />
    </>
  );
}

// --- VOICE INPUT COMPONENT ---

// Hook: auto-start speech recognition on field focus, show "Speak now" overlay
function useVoiceField(isEmail: boolean = false) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const callbackRef = useRef<((text: string) => void) | null>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onresult = (event: any) => {
        let transcript = event.results[0][0].transcript;
        if (isEmail) {
          transcript = transcript.toLowerCase()
            .replace(/\s+at\s+/g, '@')
            .replace(/\s+dot\s+/g, '.')
            .replace(/\s+/g, '');
          if (!transcript.includes('@')) {
            if (transcript.includes('gmail')) {
              transcript = transcript.replace('gmail', '@gmail.com');
            } else {
              transcript += '@gmail.com';
            }
          }
          transcript = transcript.replace(/@@/g, '@');
        }
        callbackRef.current?.(transcript);
        setIsListening(false);
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      recognitionRef.current = rec;
    }
  }, [isEmail]);

  const startListening = useCallback((onResult: (text: string) => void) => {
    if (recognitionRef.current && !isListening) {
      callbackRef.current = onResult;
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        // Already started or not available
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  return { isListening, startListening, stopListening, supported: !!recognitionRef.current };
}

const SpeakNowBadge = ({ visible }: { visible: boolean }) => (
  <AnimatePresence>
    {visible && (
      <motion.div
        initial={{ opacity: 0, y: 4, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.95 }}
        className="absolute -top-8 left-0 flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 px-3 py-1 rounded-full z-20"
      >
        <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
        <span className="text-[9px] uppercase tracking-[0.3em] text-cyan-400 font-bold">Speak now</span>
      </motion.div>
    )}
  </AnimatePresence>
);

// --- ANIMATED TEXT COMPONENTS ---

const ExplodingText = ({ text, className }: { text: string, className?: string }) => {
  const letters = text.split("");
  
  const container = {
    hidden: { opacity: 0 },
    visible: (i = 1) => ({
      opacity: 1,
      transition: { staggerChildren: 0.03, delayChildren: 0.04 * i },
    }),
  };

  const child = {
    visible: {
      opacity: 1,
      y: 0,
      rotate: 0,
      filter: "blur(0px)",
      transition: {
        type: "spring" as const,
        damping: 12,
        stiffness: 200,
      },
    },
    hidden: {
      opacity: 0,
      y: 20,
      rotate: 10,
      filter: "blur(10px)",
    },
  };

  return (
    <motion.h1
      style={{ display: "flex", flexWrap: "wrap" }}
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      className={className}
    >
      {letters.map((letter, index) => (
        <motion.span
          variants={child}
          key={index}
          style={{ display: "inline-block" }}
        >
          {letter === " " ? "\u00A0" : letter}
        </motion.span>
      ))}
    </motion.h1>
  );
};

const VirtualCursor = ({ cursorPos, pinchProgress, interactionMode, clickFeedback }: any) => {
  return (
    <div className="fixed inset-0 pointer-events-none z-[100]">
      {/* Virtual Cursor */}
      <motion.div 
        className="absolute w-8 h-8 -ml-4 -mt-4 flex items-center justify-center"
        animate={{ x: cursorPos.x, y: cursorPos.y }}
        transition={{ type: "spring", stiffness: 500, damping: 30, mass: 0.5 }}
      >
        {/* Outer Ring */}
        <div className="absolute inset-0 border-2 border-cyan-400 rounded-full opacity-50" />
        
        {/* Pinch Progress Ring */}
        <svg className="absolute inset-0 w-full h-full -rotate-90">
          <motion.circle
            cx="16"
            cy="16"
            r="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-cyan-400"
            style={{
              pathLength: pinchProgress,
              transition: "stroke-dasharray 0.1s ease-out"
            }}
          />
        </svg>

        {/* Center Dot / Mode Indicator */}
        <motion.div 
          className={`w-2 h-2 rounded-full ${interactionMode === 'click' ? 'bg-cyan-400' : 'bg-white'}`}
          animate={{ scale: interactionMode === 'click' ? 1.5 : 1 }}
        />

        {/* Mode Label */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 bg-black/50 px-2 py-0.5 rounded border border-cyan-400/30">
            {interactionMode}
          </span>
        </div>
      </motion.div>

      {/* Click Feedback */}
      <AnimatePresence>
        {clickFeedback && (
          <motion.div
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: 4, opacity: 0 }}
            exit={{ opacity: 0 }}
            className="absolute w-12 h-12 -ml-6 -mt-6 border-2 border-cyan-400 rounded-full"
            style={{ left: clickFeedback.x, top: clickFeedback.y }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  // State
  const [mode, setMode] = useState<'intro' | 'cursor' | 'hand'>('intro');
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [interactionMode, setInteractionMode] = useState<'scroll' | 'click'>('scroll');
  const [isLoading, setIsLoading] = useState(true);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [handDetected, setHandDetected] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [pinchProgress, setPinchProgress] = useState(0);
  const [formData, setFormData] = useState({ name: '', email: '', details: '' });
  const [isRefining, setIsRefining] = useState(false);
  const [clickFeedback, setClickFeedback] = useState<{ x: number, y: number } | null>(null);
  const [toast, setToast] = useState({ show: false, message: '' });

  // Voice field hooks (one per field so they each track their own listening state)
  const voiceName = useVoiceField();
  const voiceEmail = useVoiceField(true);
  const voiceDetails = useVoiceField();

  const handleAIRefine = async () => {
    if (!formData.details) return;
    setIsRefining(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Refine this project description to be more professional and clear for a digital agency inquiry: "${formData.details}"`,
      });
      if (response.text) {
        setFormData({ ...formData, details: response.text });
        setToast({ show: true, message: 'AI Refinement Complete' });
        setTimeout(() => setToast({ show: false, message: '' }), 3000);
      }
    } catch (error) {
      console.error("AI Refinement failed:", error);
      setToast({ show: true, message: 'AI Refinement failed. Check your API key.' });
      setTimeout(() => setToast({ show: false, message: '' }), 3000);
    } finally {
      setIsRefining(false);
    }
  };

  // Magnetic Click Logic
  const getMagneticElement = useCallback((x: number, y: number) => {
    const elements = document.querySelectorAll('button, a, input, textarea, [role="button"]');
    let closest: HTMLElement | null = null;
    let minDistance = MAGNETIC_RADIUS;

    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

      if (distance < minDistance) {
        minDistance = distance;
        closest = el as HTMLElement;
      }
    });

    return closest;
  }, []);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevHandY = useRef<number | null>(null);
  const lastClickTime = useRef<number>(0);
  const smoothedPos = useRef({ x: 0, y: 0 });
  const lastTrackingTime = useRef<number>(0);
  const interactionModeRef = useRef<'scroll' | 'click'>('scroll');
  const wasTapping = useRef<boolean>(false);
  const universeRef = useRef<any>(null);
  const lastHoveredElement = useRef<HTMLElement | null>(null);
  
  // Scroll Momentum Refs
  const targetScrollY = useRef<number>(0);
  const currentScrollY = useRef<number>(0);
  
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  // Helper to detect if a finger is extended
  const isFingerExtended = (landmarks: any, tipIdx: number, knuckleIdx: number) => {
    const wrist = landmarks[0];
    const tip = landmarks[tipIdx];
    const knuckle = landmarks[knuckleIdx];
    const distTip = Math.sqrt((tip.x - wrist.x)**2 + (tip.y - wrist.y)**2);
    const distKnuckle = Math.sqrt((knuckle.x - wrist.x)**2 + (knuckle.y - wrist.y)**2);
    return distTip > distKnuckle;
  };

  // Initial Loading + pre-request mic permission
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 2000);
    // Pre-request microphone permission so users aren't prompted mid-experience
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then(stream => {
        // Immediately release the mic stream — we just needed the permission grant
        stream.getTracks().forEach(track => track.stop());
      })
      .catch(() => {
        // Permission denied or not available — voice input will gracefully degrade
      });
    return () => clearTimeout(timer);
  }, []);

  // --- SMOOTH SCROLL LOOP ---
  useEffect(() => {
    let rafId: number;
    const updateScroll = () => {
      // Interpolate scroll position
      const diff = targetScrollY.current - currentScrollY.current;
      if (Math.abs(diff) > 0.1) {
        currentScrollY.current += diff * SCROLL_SMOOTHING;
        window.scrollTo(0, currentScrollY.current);
      }
      rafId = requestAnimationFrame(updateScroll);
    };
    rafId = requestAnimationFrame(updateScroll);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // --- THREE.JS UNIVERSE SETUP ---
  const initUniverse = useCallback(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.z = 10;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);

    // Stars
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(STAR_COUNT * 3);
    const starColors = new Float32Array(STAR_COUNT * 3);

    for (let i = 0; i < STAR_COUNT; i++) {
      const x = (Math.random() - 0.5) * 200;
      const y = (Math.random() - 0.5) * 200;
      const z = (Math.random() - 0.5) * 200;
      starPositions[i * 3] = x;
      starPositions[i * 3 + 1] = y;
      starPositions[i * 3 + 2] = z;

      const r = 0.5 + Math.random() * 0.5;
      const g = 0.8 + Math.random() * 0.2;
      const b = 1.0;
      starColors[i * 3] = r;
      starColors[i * 3 + 1] = g;
      starColors[i * 3 + 2] = b;
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starMaterial = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    // Nebula (Central Glow)
    const nebulaGeometry = new THREE.SphereGeometry(5, 32, 32);
    const nebulaMaterial = new THREE.MeshBasicMaterial({
      color: 0x4400ff,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
    const nebula = new THREE.Mesh(nebulaGeometry, nebulaMaterial);
    scene.add(nebula);

    const handPos = new THREE.Vector3(0, 0, 0);
    universeRef.current = { scene, camera, renderer, stars, nebula, handPos };

    const animate = () => {
      requestAnimationFrame(animate);
      const time = Date.now() * 0.0005;
      stars.rotation.y = time * 0.05;
      stars.rotation.x = time * 0.02;
      if (handPos) {
        stars.position.x += (handPos.x * 0.2 - stars.position.x) * 0.05;
        stars.position.y += (handPos.y * 0.2 - stars.position.y) * 0.05;
        nebula.position.copy(stars.position);
        nebula.scale.setScalar(1 + Math.sin(time * 2) * 0.1);
      }
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (containerRef.current) containerRef.current.removeChild(renderer.domElement);
    };
  }, []);

  // --- MEDIAPIPE HAND TRACKING ---
  useEffect(() => {
    if (mode === 'intro') return;
    if (!videoRef.current || !canvasRef.current) return;

    let isMounted = true;
    let camera_mp: any = null;

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
      if (!isMounted) return;
      if (isCalibrating) {
        console.log("MediaPipe: First results received");
        setIsCalibrating(false);
      }
      const canvasCtx = canvasRef.current?.getContext('2d');
      if (!canvasCtx || !canvasRef.current) return;

      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        setHandDetected(true);
        lastTrackingTime.current = Date.now();
        const landmarks = results.multiHandLandmarks[0];
        
        // Draw skeleton in preview
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FFFF', lineWidth: 2 });
        drawLandmarks(canvasCtx, landmarks, { color: '#FFFFFF', lineWidth: 1, radius: 2 });

        // 1. Gesture Detection
        const indexExtended = isFingerExtended(landmarks, 8, 5);
        const middleExtended = isFingerExtended(landmarks, 12, 9);
        const ringExtended = isFingerExtended(landmarks, 16, 13);
        const pinkyExtended = isFingerExtended(landmarks, 20, 17);

        const extendedCount = [indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;

        // Mode Switching
        if (extendedCount >= 4) {
          if (interactionModeRef.current !== 'scroll') {
            interactionModeRef.current = 'scroll';
            setInteractionMode('scroll');
            prevHandY.current = null; 
          }
        } else if (extendedCount <= 1) {
          if (interactionModeRef.current !== 'click') {
            interactionModeRef.current = 'click';
            setInteractionMode('click');
          }
        }

        // 2. Virtual Cursor Position
        const cursorTarget = (interactionModeRef.current === 'click' && indexExtended) ? landmarks[8] : landmarks[9];
        
        const expandedX = (cursorTarget.x - 0.5) * CURSOR_RANGE_SCALE + 0.5;
        const expandedY = (cursorTarget.y - 0.5) * CURSOR_RANGE_SCALE + 0.5;
        
        const clampedX = Math.max(0, Math.min(1, expandedX));
        const clampedY = Math.max(0, Math.min(1, expandedY));

        const targetX = (1 - clampedX) * window.innerWidth;
        const targetY = clampedY * window.innerHeight;

        const smoothingFactor = interactionModeRef.current === 'click' ? 0.2 : 0.08;
        smoothedPos.current.x += (targetX - smoothedPos.current.x) * smoothingFactor;
        smoothedPos.current.y += (targetY - smoothedPos.current.y) * smoothingFactor;
        
        // Magnetic Snap
        const magneticElement = getMagneticElement(smoothedPos.current.x, smoothedPos.current.y);
        if (magneticElement) {
          const rect = magneticElement.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          setCursorPos({ x: centerX, y: centerY });
        } else {
          setCursorPos({ x: smoothedPos.current.x, y: smoothedPos.current.y });
        }

        // --- HAND HOVER SIMULATION ---
        const hx = magneticElement ? (magneticElement.getBoundingClientRect().left + magneticElement.getBoundingClientRect().width / 2) : smoothedPos.current.x;
        const hy = magneticElement ? (magneticElement.getBoundingClientRect().top + magneticElement.getBoundingClientRect().height / 2) : smoothedPos.current.y;
        const hoveredEl = (magneticElement || document.elementFromPoint(hx, hy)) as HTMLElement | null;
        // Walk up to find the nearest interactive/group ancestor
        const findHoverTarget = (el: HTMLElement | null): HTMLElement | null => {
          let current = el;
          while (current && current !== document.body) {
            if (current.matches('button, a, [role="button"], .group, input, textarea')) return current;
            // Also check if parent is a .group (for card hover effects)
            if (current.parentElement?.matches('.group')) return current.parentElement;
            current = current.parentElement as HTMLElement | null;
          }
          return el;
        };
        const hoverTarget = findHoverTarget(hoveredEl);

        if (lastHoveredElement.current !== hoverTarget) {
          // Remove hover from previous element and its ancestors
          if (lastHoveredElement.current) {
            lastHoveredElement.current.classList.remove(HAND_HOVER_CLASS);
            lastHoveredElement.current.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
            lastHoveredElement.current.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
            // Also remove from ancestor .group elements
            let ancestor = lastHoveredElement.current.closest('.group') as HTMLElement | null;
            if (ancestor) ancestor.classList.remove(HAND_HOVER_CLASS);
          }
          // Add hover to new element
          if (hoverTarget) {
            hoverTarget.classList.add(HAND_HOVER_CLASS);
            hoverTarget.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            hoverTarget.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
            // Also add to ancestor .group elements
            let ancestor = hoverTarget.closest('.group') as HTMLElement | null;
            if (ancestor && ancestor !== hoverTarget) ancestor.classList.add(HAND_HOVER_CLASS);
          }
          lastHoveredElement.current = hoverTarget;
        }

        // 3. Interaction Logic (Fist to Stop, Tap/Pinch to Click)
        if (interactionModeRef.current === 'click') {
          prevHandY.current = null;
          
          const thumbTip = landmarks[4];
          const indexTip = landmarks[8];
          const dist = Math.sqrt((thumbTip.x - indexTip.x)**2 + (thumbTip.y - indexTip.y)**2);
          
          // Improved pinch detection: check distance and relative velocity/stability
          const isPinchingGesture = dist < 0.042; // Even tighter for precision
          
          setPinchProgress(Math.max(0, 1 - (dist / 0.09)));
          
          if (isPinchingGesture && !wasTapping.current) {
            const now = Date.now();
            if (now - lastClickTime.current > 800) { // More cooldown to prevent double clicks
              const magneticElement = getMagneticElement(smoothedPos.current.x, smoothedPos.current.y);
              const element = magneticElement || document.elementFromPoint(smoothedPos.current.x, smoothedPos.current.y);
              
              if (element instanceof HTMLElement) {
                const rect = element.getBoundingClientRect();
                setClickFeedback({ 
                  x: rect.left + rect.width / 2, 
                  y: rect.top + rect.height / 2 
                });
                setTimeout(() => setClickFeedback(null), 400);

                // Trigger click with haptic-like feedback
                element.click();
                
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                  element.focus();
                }
              }
              lastClickTime.current = now;
            }
          }
          wasTapping.current = isPinchingGesture;
          
        } else if (interactionModeRef.current === 'scroll') {
          wasTapping.current = false;
          setPinchProgress(0);
          
          const currentY = landmarks[9].y;
          if (prevHandY.current !== null) {
            const deltaY = (prevHandY.current - currentY) * window.innerHeight * SCROLL_SENSITIVITY;
            if (Math.abs(deltaY) > 2) {
              targetScrollY.current = Math.max(0, Math.min(document.documentElement.scrollHeight - window.innerHeight, targetScrollY.current + deltaY));
            }
          }
          prevHandY.current = currentY;
        }
      } else {
        if (Date.now() - lastTrackingTime.current > TRACKING_LOST_TIMEOUT) {
          setHandDetected(false);
        }
        prevHandY.current = null;
        setPinchProgress(0);
        // Clear hand hover when hand is lost
        if (lastHoveredElement.current) {
          lastHoveredElement.current.classList.remove(HAND_HOVER_CLASS);
          let ancestor = lastHoveredElement.current.closest('.group') as HTMLElement | null;
          if (ancestor) ancestor.classList.remove(HAND_HOVER_CLASS);
          lastHoveredElement.current = null;
        }
      }
      canvasCtx.restore();
    });

    camera_mp = new Camera(videoRef.current!, {
      onFrame: async () => {
        if (!isMounted) return;
        try {
          await hands.send({ image: videoRef.current! });
        } catch (err) {
          // Silently handle frame errors
        }
      },
      width: 640,
      height: 480,
    });
    
    const calibrationTimeout = setTimeout(() => {
      if (isCalibrating && isMounted) {
        setIsCalibrating(false);
      }
    }, 10000);

    // Small delay before starting to ensure previous instances are fully released
    const startTimeout = setTimeout(async () => {
      if (!isMounted) return;
      
      try {
        console.log("MediaPipe: Attempting to start camera...");
        setCameraError(null);
        await camera_mp.start();
      } catch (err: any) {
        if (isMounted) {
          const errorMessage = err?.message || String(err);
          console.error("MediaPipe camera start error:", errorMessage);
          setCameraError(errorMessage);
          // Don't automatically close calibration so user can see error
        }
      }
    }, 800);

    return () => {
      isMounted = false;
      clearTimeout(calibrationTimeout);
      clearTimeout(startTimeout);
      if (camera_mp) camera_mp.stop();
      hands.close();
    };
  }, [mode]);

  // Reset scroll on page change
  useEffect(() => {
    targetScrollY.current = 0;
    currentScrollY.current = 0;
    window.scrollTo(0, 0);
  }, [currentPage]);

  return (
    <div className="relative w-full min-h-screen bg-black text-white selection:bg-white/30 overflow-x-hidden font-sans">
      {/* Three.js Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Canvas>
          <Suspense fallback={null}>
            <Scene scrollProgress={scrollYProgress} cursorPos={cursorPos} currentPage={currentPage} />
          </Suspense>
        </Canvas>
      </div>

      {/* Scroll Progress Bar */}
      <motion.div 
        className="fixed top-0 left-0 h-1 bg-cyan-400 z-[100] origin-left"
        style={{ scaleX }}
      />

      {/* Intro Screen */}
      <AnimatePresence>
        {mode === 'intro' && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
            className={`fixed inset-0 z-[100] flex items-center justify-center bg-black overflow-hidden ${mode !== 'intro' ? 'pointer-events-none' : ''}`}
          >
            {/* Ambient Background */}
            <div className="absolute inset-0 opacity-20">
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,#00ffff_0%,transparent_50%)]" />
            </div>

            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 text-center px-6 max-w-4xl"
            >
              <div className="mb-12 flex justify-center">
                <div className="w-24 h-24 rounded-full flex items-center justify-center bg-black relative group overflow-hidden">
                  <div className="absolute inset-0 bg-cyan-400/20 rounded-full blur-xl group-hover:bg-cyan-400/40 transition-all" />
                  <img src="/gitwixlogo.png" alt="Gitwix" className="w-full h-full object-contain relative z-10" />
                </div>
              </div>

              <div className="text-white/40 font-mono text-[10px] tracking-[0.6em] uppercase mb-8">Gitwix — Digital Agency</div>
              
              <h1 className="text-[10vw] lg:text-[7vw] font-display font-black leading-none mb-8 tracking-tighter">
                CRAFTING <br />
                <span className="text-outline italic">DIGITAL</span> <br />
                EMPIRES.
              </h1>
              
              <p className="text-white/40 text-sm lg:text-base tracking-[0.4em] uppercase mb-16 font-light max-w-2xl mx-auto leading-relaxed">
                Engineering the next generation of <br /> high-performance digital experiences.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
                <button 
                  onClick={() => setMode('cursor')}
                  className="group relative px-12 py-5 bg-white text-black rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95"
                >
                  <span className="relative z-10 font-sans font-black uppercase tracking-[0.3em] text-[10px]">Standard Experience</span>
                  <div className="absolute inset-0 bg-cyan-400 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                </button>

                <button 
                  onClick={() => {
                    setMode('hand');
                    setIsCalibrating(true);
                  }}
                  className="group flex items-center gap-4 px-12 py-5 border border-white/10 rounded-full hover:bg-white/5 transition-all hover:border-white/40"
                >
                  <Hand className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <span className="font-sans font-black uppercase tracking-[0.3em] text-[10px]">Immersive AI Mode</span>
                </button>
              </div>

              {isLoading && (
                <div className="mt-16 flex items-center justify-center gap-3 text-white/20">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-[10px] uppercase tracking-widest">Warming up systems...</span>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[200] bg-white text-black px-8 py-4 rounded-full font-display font-bold text-sm shadow-2xl flex items-center gap-4"
          >
            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hand Mode UI Elements */}
      {mode === 'hand' && (
        <>
          <VirtualCursor 
            cursorPos={cursorPos} 
            pinchProgress={pinchProgress} 
            interactionMode={interactionMode} 
            clickFeedback={clickFeedback} 
          />

          {/* Hand Preview Window */}
          <div className="fixed bottom-8 right-8 z-50 group">
            <div className="relative w-48 h-32 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-500 group-hover:w-64 group-hover:h-48">
              <video 
                ref={videoRef} 
                className="absolute opacity-0 pointer-events-none" 
                playsInline 
                muted 
                width="640" 
                height="480" 
              />
              <canvas ref={canvasRef} className="w-full h-full object-cover opacity-60" />
              
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${handDetected ? 'bg-white animate-pulse' : 'bg-white/20'}`} />
                <span className="text-[8px] uppercase tracking-widest font-bold text-white/40">
                  {handDetected ? 'AI Tracking Active' : 'Searching for hand...'}
                </span>
              </div>

              {!handDetected && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Hand className="w-6 h-6 text-white/10 animate-bounce" />
                </div>
              )}
            </div>
          </div>

          {/* Loading State */}
          {isCalibrating && (
            <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/80 backdrop-blur-2xl">
              <div className="relative mb-12">
                <div className="absolute inset-0 bg-cyan-400/20 blur-3xl rounded-full animate-pulse" />
                {cameraError ? (
                  <div className="relative z-10 w-20 h-20 flex items-center justify-center bg-red-500/20 rounded-full border border-red-500/50">
                    <Hand className="w-10 h-10 text-red-500" />
                  </div>
                ) : (
                  <Loader2 className="relative z-10 w-20 h-20 animate-spin text-cyan-400" />
                )}
              </div>
              
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center px-6"
              >
                <h2 className="text-[14px] tracking-[0.8em] uppercase font-black text-white mb-4">
                  {cameraError ? 'Hardware Conflict' : 'Neural Calibration'}
                </h2>
                <p className="text-[10px] tracking-[0.3em] uppercase text-white/40 max-w-sm mx-auto leading-relaxed mb-12">
                  {cameraError ? (
                    <>
                      Failed to acquire camera feed: <span className="text-red-400/60">{cameraError}</span>. <br />
                      Please ensure your camera is not in use by another app and permissions are granted.
                    </>
                  ) : (
                    <>
                      Syncing spatial sensors with your environment. <br />
                      Please ensure your hand is visible to the camera.
                    </>
                  )}
                </p>

                <div className="flex flex-col items-center gap-4">
                  {cameraError && (
                    <button 
                      onClick={() => window.location.reload()}
                      className="px-8 py-3 bg-white text-black rounded-full text-[9px] uppercase tracking-[0.4em] font-black hover:scale-105 transition-all"
                    >
                      Restart Application
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      setIsCalibrating(false);
                      setCameraError(null);
                    }}
                    className="px-8 py-3 border border-white/10 rounded-full text-[9px] uppercase tracking-[0.4em] text-white/40 hover:text-white hover:border-white/40 transition-all"
                  >
                    {cameraError ? 'Continue without AI' : 'Skip Calibration'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </>
      )}

      {/* Vertical Rail Text */}
      <div className="fixed left-8 bottom-32 z-50 vertical-text hidden lg:block">
        <span className="text-[10px] uppercase tracking-[0.5em] font-mono text-white/30">
          Digital Empire Builders — Est. 2024 — London / Global
        </span>
      </div>

      {/* Navigation Bar */}
      <nav className={`fixed top-0 left-0 right-0 z-40 px-12 py-10 flex items-center justify-between transition-all duration-1000 ${mode === 'intro' ? 'opacity-0 -translate-y-10' : 'opacity-100 translate-y-0'}`}>
        <div className="text-2xl font-serif italic tracking-tighter cursor-pointer flex items-center gap-4 group" onClick={() => setCurrentPage('home')}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center transition-all overflow-hidden bg-black">
            <img src="/gitwixlogo.png" alt="Gitwix" className="w-full h-full object-contain" />
          </div>
          <span className="tracking-[0.2em] font-sans font-black text-sm">GITWIX</span>
        </div>
        <div className="flex items-center space-x-12">
          {(['home', 'services', 'portfolio', 'book'] as Page[]).map((p) => (
            <button 
              key={p} 
              onClick={() => setCurrentPage(p)}
              className={`text-[11px] uppercase tracking-[0.4em] font-sans font-bold transition-all relative group ${currentPage === p ? 'text-white' : 'text-white/40 hover:text-white'}`}
            >
              {p}
              <span className={`absolute -bottom-2 left-0 h-[1px] bg-white transition-all duration-500 ${currentPage === p ? 'w-full' : 'w-0 group-hover:w-full'}`} />
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className={`relative z-10 transition-opacity duration-1000 ${mode === 'intro' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <AnimatePresence mode="wait">
          {currentPage === 'home' && (
            <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
              {/* Split Layout Hero */}
              <div className="flex flex-col lg:flex-row min-h-screen">
                {/* Left Side: Sticky */}
                <div className="lg:w-1/2 lg:h-screen lg:sticky lg:top-0 flex flex-col justify-center px-12 lg:px-24 py-24">
                  <motion.div
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <span className="text-cyan-400 font-mono text-[10px] tracking-[0.5em] uppercase mb-8 block">Award-Winning Digital Studio</span>
                    
                    <div className="mb-12">
                      <ExplodingText 
                        text="CRAFTING" 
                        className="text-[8vw] lg:text-[7vw] font-display font-black leading-[0.85] tracking-tighter"
                      />
                      <ExplodingText 
                        text="DIGITAL" 
                        className="text-[8vw] lg:text-[7vw] font-display font-black leading-[0.85] tracking-tighter text-outline italic"
                      />
                      <ExplodingText 
                        text="EMPIRES." 
                        className="text-[8vw] lg:text-[7vw] font-display font-black leading-[0.85] tracking-tighter"
                      />
                    </div>

                    <p className="text-xl text-white/40 max-w-md leading-relaxed font-light mb-12">
                      We engineer high-performance digital experiences for global brands that demand distinction.
                    </p>
                    <button onClick={() => setCurrentPage('book')} className="group flex items-center gap-6 text-sm font-bold tracking-[0.4em] uppercase">
                      <span>Start a project</span>
                      <div className="w-14 h-14 border border-white/20 rounded-full flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all duration-500 group-hover:scale-110">
                        <ArrowRight className="w-5 h-5" />
                      </div>
                    </button>
                  </motion.div>
                </div>

                {/* Right Side: Scrolling */}
                <div className="lg:w-1/2 px-12 lg:px-24 py-24 space-y-64">
                  <section>
                    <span className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase mb-8 block">01 — The Vision</span>
                    <h2 className="text-5xl font-display font-bold mb-12 leading-tight">We don't just build websites. We craft digital legacies.</h2>
                    <p className="text-lg text-white/40 leading-relaxed font-light">
                      Our philosophy is rooted in the intersection of high-end editorial design and clinical technical precision. Every pixel is a strategic decision.
                    </p>
                  </section>

                  <section>
                    <div className="aspect-video bg-white/5 rounded-3xl overflow-hidden relative group">
                      <img 
                        src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1200" 
                        alt="Studio" 
                        className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-1000 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-60" />
                      <div className="absolute bottom-8 left-8">
                        <span className="text-[10px] font-mono tracking-widest text-white/60 uppercase">London HQ</span>
                      </div>
                    </div>
                  </section>

                  <section>
                    <span className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase mb-8 block">02 — Expertise</span>
                    <div className="space-y-12">
                      {[
                        { title: "Strategic Engineering", desc: "Data-driven roadmaps for digital dominance." },
                        { title: "Editorial Aesthetics", desc: "Visual storytelling that elevates brand perception." },
                        { title: "Immersive Tech", desc: "Next-gen interactions that captivate audiences." }
                      ].map((s, i) => (
                        <motion.div 
                          key={i}
                          whileInView={{ opacity: 1, x: 0 }}
                          initial={{ opacity: 0, x: 50 }}
                          transition={{ duration: 0.8, delay: i * 0.2 }}
                          className="group border-b border-white/10 pb-12"
                        >
                          <h3 className="text-3xl font-display font-bold mb-4 group-hover:text-cyan-400 transition-colors">{s.title}</h3>
                          <p className="text-white/40 font-light">{s.desc}</p>
                        </motion.div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <div className="p-12 glass-panel rounded-3xl">
                      <h3 className="text-2xl font-display font-bold mb-8 italic">"The future of the web is not static pages, but immersive environments."</h3>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-cyan-400 rounded-full" />
                        <div>
                          <p className="text-xs font-bold uppercase tracking-widest">Marcus Gitwix</p>
                          <p className="text-[10px] text-white/40 uppercase tracking-widest">Founder & CEO</p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="pb-32">
                    <span className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase mb-8 block">03 — Impact</span>
                    <div className="grid grid-cols-2 gap-12">
                      <div>
                        <h4 className="text-6xl font-display font-black mb-2">98%</h4>
                        <p className="text-[10px] uppercase tracking-widest text-white/20">Retention Rate</p>
                      </div>
                      <div>
                        <h4 className="text-6xl font-display font-black mb-2">120+</h4>
                        <p className="text-[10px] uppercase tracking-widest text-white/20">Projects Delivered</p>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </motion.div>
          )}

          {currentPage === 'services' && (
            <motion.div key="services" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-screen pt-48 px-12 lg:px-24">
              <div className="max-w-7xl mx-auto">
                <div className="mb-32">
                  <span className="text-[10px] font-mono tracking-[0.4em] text-white/40 uppercase mb-8 block">Capabilities</span>
                  <ExplodingText text="OUR EXPERTISE" className="text-7xl lg:text-9xl font-display font-black mb-12 tracking-tighter" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-white/5 border border-white/5">
                  {[
                    { title: "Strategic Design", desc: "Crafting visual identities that resonate and endure. We build brands that command attention.", icon: Zap },
                    { title: "Web Engineering", desc: "High-performance, scalable solutions for the modern web. Engineered for speed and scale.", icon: Globe },
                    { title: "Immersive Experiences", desc: "Pushing the boundaries of interaction with AI and 3D. Next-gen digital environments.", icon: Hand },
                    { title: "Brand Strategy", desc: "Defining your voice in a crowded digital landscape. Strategic roadmaps for dominance.", icon: Layers },
                    { title: "Performance Optimization", desc: "Ensuring your digital empire is fast and efficient. Clinical technical precision.", icon: Activity },
                    { title: "Consulting", desc: "Expert guidance on your digital transformation journey. Strategic engineering advice.", icon: Shield }
                  ].map((s, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      transition={{ duration: 1, delay: i * 0.1 }}
                      className="bg-black p-16 hover:bg-white/5 transition-all group border border-white/5"
                    >
                      <div className="w-12 h-12 border border-white/10 rounded-full flex items-center justify-center mb-8 group-hover:border-cyan-400 transition-colors">
                        <s.icon className="w-5 h-5 text-white/40 group-hover:text-cyan-400" />
                      </div>
                      <h3 className="text-3xl font-display font-bold mb-6 group-hover:text-cyan-400 transition-colors">{s.title}</h3>
                      <p className="text-lg text-white/40 font-light leading-relaxed max-w-md">{s.desc}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {currentPage === 'portfolio' && (
            <motion.div key="portfolio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-screen pt-48 px-12 lg:px-24">
              <div className="max-w-7xl mx-auto">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-32 gap-12">
                  <div>
                    <span className="text-[10px] font-mono tracking-[0.4em] text-white/40 uppercase mb-8 block">Selected Work</span>
                    <ExplodingText text="THE ARCHIVE" className="text-7xl lg:text-9xl font-display font-black tracking-tighter" />
                  </div>
                  <div className="text-right">
                    <p className="text-white/40 text-sm font-light uppercase tracking-widest leading-relaxed">
                      A curated selection of our <br />most impactful digital legacies.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-24">
                  {[
                    { title: "Aetheria", category: "Immersive Platform", img: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1200" },
                    { title: "Nova Core", category: "Enterprise SaaS", img: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1200" },
                    { title: "Lumina", category: "Editorial Design", img: "https://images.unsplash.com/photo-1558655146-d09347e92766?auto=format&fit=crop&q=80&w=1200" },
                    { title: "Zenith", category: "Brand Identity", img: "https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&q=80&w=1200" }
                  ].map((p, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, y: 50 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ duration: 1, delay: i * 0.2 }}
                      className="group cursor-pointer"
                    >
                      <div className="aspect-[16/10] bg-white/5 rounded-3xl overflow-hidden mb-8 relative">
                        <img src={p.img} alt={p.title} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-1000 group-hover:scale-110" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-all" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-20 h-20 bg-white text-black rounded-full flex items-center justify-center font-bold text-[10px] uppercase tracking-widest">View</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-3xl font-display font-bold mb-2 group-hover:text-cyan-400 transition-colors">{p.title}</h3>
                          <p className="text-[10px] uppercase tracking-[0.4em] text-white/40">{p.category}</p>
                        </div>
                        <ArrowRight className="w-6 h-6 text-white/20 group-hover:text-white group-hover:translate-x-2 transition-all" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {currentPage === 'book' && (
            <motion.div key="book" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-screen flex items-center justify-center px-12 lg:px-24">
              <div className="max-w-7xl w-full mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
                  <div>
                    <span className="text-[10px] font-mono tracking-[0.4em] text-white/40 uppercase mb-8 block">Contact</span>
                    <h2 className="text-7xl font-serif italic mb-12 leading-tight">Let's build <br />your empire.</h2>
                    <p className="text-xl text-white/50 leading-relaxed font-light mb-16">
                      Ready to elevate your digital presence? Book a consultation with our strategy team to discuss your goals and how we can achieve them.
                    </p>
                    <div className="space-y-8">
                      <div>
                        <span className="text-[10px] uppercase tracking-widest text-white/30 block mb-2">Email us</span>
                        <a href="mailto:hello@gitwix.com" className="text-2xl font-serif italic hover:text-white/60 transition-colors">hello@gitwix.com</a>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-widest text-white/30 block mb-2">Visit us</span>
                        <p className="text-2xl font-serif italic">London, United Kingdom</p>
                      </div>
                    </div>
                  </div>
                  <div className="glass-panel p-16 rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl relative overflow-hidden">
                    <form className="space-y-12" onSubmit={(e) => { 
                      e.preventDefault(); 
                      setToast({ show: true, message: 'Inquiry Received. Our team will reach out within 24 hours.' });
                      setTimeout(() => setToast({ show: false, message: '' }), 5000);
                    }}>
                      <div className="space-y-8">
                        <div className="relative border-b border-white/10 pb-4 focus-within:border-white transition-colors">
                          <SpeakNowBadge visible={voiceName.isListening} />
                          <label className="text-[10px] uppercase tracking-widest text-white/30 block mb-2">Your Name</label>
                          <input 
                            type="text" 
                            required 
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            onFocus={() => voiceName.startListening((text) => setFormData(prev => ({ ...prev, name: text })))}
                            onBlur={() => voiceName.stopListening()}
                            className="w-full bg-transparent outline-none text-xl font-serif italic placeholder:text-white/10" 
                            placeholder="Alexander Wright" 
                          />
                        </div>
                        <div className="relative border-b border-white/10 pb-4 focus-within:border-white transition-colors">
                          <SpeakNowBadge visible={voiceEmail.isListening} />
                          <label className="text-[10px] uppercase tracking-widest text-white/30 block mb-2">Email Address</label>
                          <input 
                            type="email" 
                            required 
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            onFocus={() => voiceEmail.startListening((text) => setFormData(prev => ({ ...prev, email: text })))}
                            onBlur={() => voiceEmail.stopListening()}
                            className="w-full bg-transparent outline-none text-xl font-serif italic placeholder:text-white/10" 
                            placeholder="alex@empire.com" 
                          />
                        </div>
                        <div className="relative border-b border-white/10 pb-4 focus-within:border-white transition-colors">
                          <SpeakNowBadge visible={voiceDetails.isListening} />
                          <label className="text-[10px] uppercase tracking-widest text-white/30 block mb-2">Project Details</label>
                          <textarea 
                            rows={3} 
                            value={formData.details}
                            onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                            onFocus={() => voiceDetails.startListening((text) => setFormData(prev => ({ ...prev, details: text })))}
                            onBlur={() => voiceDetails.stopListening()}
                            className="w-full bg-transparent outline-none text-xl font-serif italic placeholder:text-white/10 resize-none" 
                            placeholder="Tell us about your vision..." 
                          />
                          {formData.details && (
                            <button
                              type="button"
                              onClick={handleAIRefine}
                              disabled={isRefining}
                              className="mt-4 flex items-center gap-2 text-[9px] uppercase tracking-widest text-cyan-400 hover:text-white transition-colors disabled:opacity-50"
                            >
                              {isRefining ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Sparkles className="w-3 h-3" />
                              )}
                              {isRefining ? 'Refining...' : 'Refine with AI'}
                            </button>
                          )}
                        </div>
                      </div>
                      <button type="submit" className="w-full py-6 bg-white text-black font-sans font-black uppercase tracking-[0.3em] text-xs rounded-full hover:bg-white/90 transition-all active:scale-95">
                        Send Inquiry
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-24 border-t border-white/5 text-center">
        <div className="text-[10px] uppercase tracking-[0.5em] font-mono text-white/20">
          &copy; 2026 Gitwix Agency &bull; High-Performance Web Engineering &bull; London
        </div>
      </footer>
    </div>
  );
}
