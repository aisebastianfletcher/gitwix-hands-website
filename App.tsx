import { GoogleGenAI } from "@google/genai";
import React, { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Stars } from '@react-three/drei';
import { Hands, Results, HAND_CONNECTIONS } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { Loader2, Hand, Sparkles, Globe, Layers, Mail, Activity, Zap, Shield, ArrowRight, ArrowLeft, ChevronRight, ExternalLink, Check, Star, Clock, Code, Palette, Search, Wrench, ShoppingCart, Smartphone, CalendarDays, Phone } from 'lucide-react';
import { motion, AnimatePresence, useScroll, useSpring, useTransform, useMotionValueEvent } from 'motion/react';

// --- CONSTANTS ---
const PINCH_THRESHOLD = 0.04;
const SCROLL_SENSITIVITY = 4;
const CURSOR_SMOOTHING = 0.1;
const SCROLL_SMOOTHING = 0.04;
const TRACKING_LOST_TIMEOUT = 1000;
const CURSOR_RANGE_SCALE = 1.8;
const MAGNETIC_RADIUS = 140;
const MAGNETIC_RADIUS_FORM = 200;
const STAR_COUNT = 1000;
const HAND_HOVER_CLASS = 'hand-hover';
const IFRAME_SCROLL_SENSITIVITY = 2.5;
const IFRAME_SCROLL_DAMPENING = 0.15;
const CLICK_DEBOUNCE_MS = 450;
const CURSOR_SMOOTHING_CLICK = 0.35;
const CURSOR_SMOOTHING_SCROLL = 0.06;
const CURSOR_DWELL_LOCK_FRAMES = 6;
const CURSOR_DWELL_LOCK_RADIUS = 20;

type Page = 'home' | 'services' | 'portfolio' | 'about' | 'book';

const PAGE_COLORS: Record<Page, string> = {
  home: '#00ffff',
  services: '#ff00ff',
  portfolio: '#ffcc00',
  about: '#ff6600',
  book: '#00ff88'
};

// --- THREE.JS COMPONENTS ---
function MorphingSphere({ scrollProgress, cursorPos, targetColor }: { scrollProgress: any, cursorPos: { x: number, y: number }, targetColor: string }) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const count = 15000;
  const currentColor = useRef(new THREE.Color('#00ffff'));
  const lerpColor = useRef(new THREE.Color('#00ffff'));

  const [positions, spherePositions, randomPositions] = React.useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sphere = new Float32Array(count * 3);
    const random = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const phi = Math.acos(-1 + (2 * i) / count);
      const theta = Math.sqrt(count * Math.PI) * phi;
      const radius = 8;
      sphere[i * 3] = radius * Math.cos(theta) * Math.sin(phi);
      sphere[i * 3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
      sphere[i * 3 + 2] = radius * Math.cos(phi);
      random[i * 3] = (Math.random() - 0.5) * 180;
      random[i * 3 + 1] = (Math.random() - 0.5) * 180;
      random[i * 3 + 2] = (Math.random() - 0.5) * 180;
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
    lerpColor.current.set(targetColor);
    currentColor.current.lerp(lerpColor.current, 0.05);
    materialRef.current.color.copy(currentColor.current);
    const mx = (cursorPos.x / window.innerWidth - 0.5) * 40;
    const my = -(cursorPos.y / window.innerHeight - 0.5) * 40;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const t_scroll = Math.pow(s, 1.8);
      const targetX = THREE.MathUtils.lerp(spherePositions[i3], randomPositions[i3], t_scroll);
      const targetY = THREE.MathUtils.lerp(spherePositions[i3 + 1], randomPositions[i3 + 1], t_scroll);
      const targetZ = THREE.MathUtils.lerp(spherePositions[i3 + 2], randomPositions[i3 + 2], t_scroll);
      const dx = posAttr.array[i3] - mx;
      const dy = posAttr.array[i3 + 1] - my;
      const dist = Math.sqrt(dx*dx + dy*dy);
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
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial ref={materialRef} size={0.04} color="#00ffff" transparent opacity={0.35} sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  );
}

function Scene({ scrollProgress, cursorPos, currentPage }: { scrollProgress: any, cursorPos: { x: number, y: number }, currentPage: Page }) {
  const { camera } = useThree();
  const targetColor = PAGE_COLORS[currentPage] || '#00ffff';
  useFrame((state) => {
    const s = scrollProgress.get();
    const t = state.clock.getElapsedTime();
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

// --- VOICE INPUT ---
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
          transcript = transcript.toLowerCase().replace(/\s+at\s+/g, '@').replace(/\s+dot\s+/g, '.').replace(/\s+/g, '');
          if (!transcript.includes('@')) {
            if (transcript.includes('gmail')) transcript = transcript.replace('gmail', '@gmail.com');
            else transcript += '@gmail.com';
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
      try { recognitionRef.current.start(); setIsListening(true); } catch (e) {}
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

// --- ANIMATED TEXT ---
const ExplodingText = ({ text, className }: { text: string, className?: string }) => {
  const letters = text.split("");
  const container = {
    hidden: { opacity: 0 },
    visible: (i = 1) => ({ opacity: 1, transition: { staggerChildren: 0.03, delayChildren: 0.04 * i } }),
  };
  const child = {
    visible: { opacity: 1, y: 0, rotate: 0, filter: "blur(0px)", transition: { type: "spring" as const, damping: 12, stiffness: 200 } },
    hidden: { opacity: 0, y: 20, rotate: 10, filter: "blur(10px)" },
  };
  return (
    <motion.h1 style={{ display: "flex", flexWrap: "wrap" }} variants={container} initial="hidden" whileInView="visible" viewport={{ once: true }} className={className}>
      {letters.map((letter, index) => (
        <motion.span variants={child} key={index} style={{ display: "inline-block" }}>
          {letter === " " ? "\u00A0" : letter}
        </motion.span>
      ))}
    </motion.h1>
  );
};

// --- VIRTUAL CURSOR ---
const VirtualCursor = ({ cursorPos, pinchProgress, interactionMode, clickFeedback }: any) => (
  <div className="fixed inset-0 pointer-events-none z-[100]">
    <motion.div className="absolute w-8 h-8 -ml-4 -mt-4 flex items-center justify-center" animate={{ x: cursorPos.x, y: cursorPos.y }} transition={{ type: "spring", stiffness: 500, damping: 30, mass: 0.5 }}>
      <div className="absolute inset-0 border-2 border-cyan-400 rounded-full opacity-50" />
      <svg className="absolute inset-0 w-full h-full -rotate-90">
        <motion.circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400" style={{ pathLength: pinchProgress }} />
      </svg>
      <motion.div className={`w-2 h-2 rounded-full ${interactionMode === 'click' ? 'bg-cyan-400' : 'bg-white'}`} animate={{ scale: interactionMode === 'click' ? 1.5 : 1 }} />
      <div className="absolute top-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
        <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 bg-black/50 px-2 py-0.5 rounded border border-cyan-400/30">{interactionMode}</span>
      </div>
    </motion.div>
    <AnimatePresence>
      {clickFeedback && (
        <motion.div initial={{ scale: 0, opacity: 1 }} animate={{ scale: 4, opacity: 0 }} exit={{ opacity: 0 }} className="absolute w-12 h-12 -ml-6 -mt-6 border-2 border-cyan-400 rounded-full" style={{ left: clickFeedback.x, top: clickFeedback.y }} />
      )}
    </AnimatePresence>
  </div>
);

// --- TESTIMONIALS DATA ---
const TESTIMONIALS = [
  { quote: "Gitwix completely transformed our online presence. The site they built loads in under a second and our enquiries have tripled since launch. Genuinely the best investment we've made.", name: "Sarah Mitchell", role: "Marketing Director, CloudNine Digital", stars: 5 },
  { quote: "We'd been burned by agencies before — Gitwix were the opposite. Transparent pricing, no outsourcing, and the final product was miles beyond the mockup. Absolutely class.", name: "James Hartley", role: "Founder, Hartley & Co Solicitors", stars: 5 },
  { quote: "Our e-commerce revenue jumped 150% in the first quarter after launch. The site is fast, beautiful, and the monthly support means we never worry about downtime.", name: "Emma Sheridan", role: "Owner, Northern Luxe Interiors", stars: 5 },
  { quote: "From brief to live in ten days — and zero revisions needed. The PWA they built works offline, scores 100 on Lighthouse, and our team actually enjoys using it.", name: "Michael Chen", role: "CTO, OpenClaw Developer", stars: 5 },
  { quote: "Professional, responsive, and incredibly skilled. They automated our entire booking flow with AI and it's saved us 20+ hours a week. Can't recommend them enough.", name: "Lisa Sherwood", role: "Practice Manager, Deansgate Health", stars: 5 },
];

// --- WHY GITWIX USP DATA ---
const WHY_GITWIX = [
  { num: "01", title: "No Outsourcing", desc: "All development is done in-house by our Manchester-based team. Your project never gets passed to unknown third parties — we own every line of code." },
  { num: "02", title: "Free Mockup First", desc: "We design a custom homepage mockup before you pay anything. Love it? Buy it. Hate it? Walk away. Zero obligation, zero risk." },
  { num: "03", title: "Transparent Pricing", desc: "No hidden fees, no surprises, no scope creep invoices. Configure and price your project instantly — what you see is what you pay." },
  { num: "04", title: "Modern Tech Stack", desc: "React, Next.js, TypeScript, AWS. Built with the same tools that power the best products on the web — fast, scalable, future-proof." },
  { num: "05", title: "SEO Built In", desc: "Every site includes on-page SEO, optimised meta tags, schema markup, and sub-second load times. Rank higher from day one." },
];

// --- STATS DATA ---
const STATS = [
  { target: 100, suffix: "+", label: "Projects Delivered" },
  { target: 100, suffix: "%", label: "Client Satisfaction" },
  { target: 100, suffix: "/100", label: "Lighthouse Scores" },
  { target: 35, suffix: "%", label: "Avg. Conversion Increase" },
];

// --- COUNTUP COMPONENT ---
function CountUp({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (!ref.current || hasAnimated) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setHasAnimated(true);
        const duration = 2000;
        const steps = 60;
        const increment = target / steps;
        let current = 0;
        const timer = setInterval(() => {
          current += increment;
          if (current >= target) {
            setCount(target);
            clearInterval(timer);
          } else {
            setCount(Math.floor(current));
          }
        }, duration / steps);
      }
    }, { threshold: 0.5 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, hasAnimated]);

  return <span ref={ref}>{count}{suffix}</span>;
}

// --- SERVICES DATA ---
const SERVICES = [
  {
    title: "Custom Websites",
    desc: "Bespoke, responsive websites tailored to your business. Mobile-first, SEO-optimised, and built to convert visitors into customers.",
    price: "From £200",
    monthly: "£50/mo",
    buildTime: "1-2 weeks",
    icon: Code,
    features: ["Responsive Design", "SEO Built-In", "Fast Loading", "CMS Integration"],
    included: [
      "Custom design from scratch",
      "Mobile-first responsive layout",
      "On-page SEO & meta tags",
      "Contact form integration",
      "Analytics setup (GA4)",
      "SSL certificate & hosting setup",
      "2 rounds of revisions",
      "30-day post-launch support"
    ],
    monthlyIncludes: [
      "Managed hosting & CDN",
      "Security monitoring & SSL renewal",
      "Monthly performance reports",
      "Content updates (up to 2hrs/mo)",
      "Bug fixes & technical support",
      "Uptime monitoring"
    ]
  },
  {
    title: "E-commerce Stores",
    desc: "Professional online stores with secure payments, inventory management, and analytics. Shopify, WooCommerce, or fully custom.",
    price: "From £500",
    monthly: "£100/mo",
    buildTime: "2-3 weeks",
    icon: ShoppingCart,
    features: ["Payment Integration", "Inventory Management", "Order Tracking", "Customer Dashboard"],
    included: [
      "Custom storefront design",
      "Stripe / PayPal integration",
      "Product catalog & categories",
      "Inventory management system",
      "Order tracking & notifications",
      "Customer accounts & dashboard",
      "Checkout flow optimisation",
      "3 rounds of revisions"
    ],
    monthlyIncludes: [
      "Managed hosting & CDN",
      "Payment gateway monitoring",
      "Security patches & updates",
      "Product upload support (up to 3hrs/mo)",
      "Performance optimisation",
      "Priority bug fixes"
    ]
  },
  {
    title: "Progressive Web Apps",
    desc: "High-performance web apps that work offline, install on devices, and achieve 100/100 Lighthouse scores.",
    price: "From £799",
    monthly: "£150/mo",
    buildTime: "2-4 weeks",
    icon: Smartphone,
    features: ["Offline Functionality", "Push Notifications", "App-Like Experience", "100/100 Lighthouse"],
    included: [
      "Service worker & offline support",
      "Push notification system",
      "App manifest & installability",
      "100/100 Lighthouse target",
      "Responsive across all devices",
      "API integration",
      "Progressive enhancement",
      "Performance audit & optimisation"
    ],
    monthlyIncludes: [
      "Managed hosting & scaling",
      "Push notification management",
      "Service worker updates",
      "Performance monitoring",
      "API uptime monitoring",
      "Priority support & bug fixes"
    ]
  },
  {
    title: "Bespoke Web Applications",
    desc: "Complex, tailored web applications and dashboards engineered for your specific workflows and business logic.",
    price: "From £1,200",
    monthly: "£200/mo",
    buildTime: "4-8 weeks",
    icon: Layers,
    features: ["Custom Architecture", "API Integration", "Real-Time Data", "Scalable Infrastructure"],
    included: [
      "Custom architecture design",
      "Database design & setup",
      "API development & integration",
      "User authentication & roles",
      "Admin dashboard",
      "Real-time data capabilities",
      "Automated testing",
      "Deployment pipeline setup"
    ],
    monthlyIncludes: [
      "Cloud infrastructure management",
      "Database backups & monitoring",
      "API uptime & error tracking",
      "Security audits & patches",
      "Scaling support",
      "Dedicated support channel"
    ]
  },
  {
    title: "AI Workflow Automation",
    desc: "Automate repetitive tasks with AI-powered workflows. Email sequences, lead routing, booking flows, and more.",
    price: "From £500",
    monthly: "£100/mo",
    buildTime: "1-3 weeks",
    icon: Zap,
    features: ["AI Integration", "Process Automation", "Email Sequences", "Lead Routing"],
    included: [
      "Workflow audit & design",
      "AI agent setup & training",
      "Email sequence automation",
      "Lead routing & scoring",
      "CRM integration",
      "Booking flow automation",
      "Status update automation",
      "Testing & documentation"
    ],
    monthlyIncludes: [
      "AI model monitoring",
      "Workflow optimisation",
      "Error handling & alerts",
      "Usage analytics",
      "Ongoing AI training",
      "Priority support"
    ]
  },
  {
    title: "Maintenance & Support",
    desc: "Ongoing maintenance, security updates, performance monitoring, and technical support to keep your site running.",
    price: "Custom",
    monthly: "From £50/mo",
    buildTime: "Ongoing",
    icon: Wrench,
    features: ["Security Updates", "Performance Monitoring", "Bug Fixes", "Priority Support"],
    included: [
      "Initial site audit",
      "Performance baseline report",
      "Security hardening",
      "Monitoring setup",
      "Documentation review",
      "Priority support channel setup"
    ],
    monthlyIncludes: [
      "Security updates & patches",
      "Performance monitoring & reports",
      "Bug fixes & troubleshooting",
      "Content updates (hours vary by plan)",
      "Uptime monitoring & alerts",
      "Monthly check-in call"
    ]
  },
];

// --- PORTFOLIO DATA ---
const PORTFOLIO = [
  {
    title: "OpenClaw Developer",
    category: "Framework Platform",
    description: "OpenClaw Developer needed a professional online presence matching the power of their Claw framework. We delivered a polished site in record time — approved first review, zero revisions needed.",
    results: ["Rapid turnaround from brief to live", "Approved first time — no revisions", "Immediate uplift in inbound enquiries"],
    url: "https://www.openclawdeveloper.co.uk/",
    img: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&q=80&w=1200"
  },
  {
    title: "We Buy Boats Spain",
    category: "Marine & Leisure",
    description: "A clean, trustworthy site that reassures boat owners across Spain. Mobile-first, conversion-optimised, and the client's smoothest project experience ever.",
    results: ["Full site live in under two weeks", "Mobile-first, conversion-optimised", "Client's smoothest project experience"],
    url: "https://www.webuyboatsspain.com/",
    img: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&q=80&w=1200"
  },
];



// ============================
// HOME PAGE CONTENT COMPONENT
// ============================
function HomePageContent({ setCurrentPage, setSelectedService }: { setCurrentPage: (p: Page) => void; setSelectedService: (i: number) => void }) {
  // --- Section 1: Hero scroll-driven fade/blur/scale ---
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  });
  const heroOpacity = useTransform(heroProgress, [0, 0.8], [1, 0]);
  const heroScale = useTransform(heroProgress, [0, 0.8], [1, 0.95]);
  const heroBlurRaw = useTransform(heroProgress, [0, 0.8], [0, 10]);

  // --- Section 2: Stats vertical line growth ---
  const statsRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: statsProgress } = useScroll({
    target: statsRef,
    offset: ["start end", "end start"]
  });
  const lineHeight = useTransform(statsProgress, [0, 1], ["0%", "100%"]);

  // --- Section 3: Horizontal scroll ---
  const hScrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: hScrollProgress } = useScroll({
    target: hScrollRef,
    offset: ["start start", "end end"]
  });
  const hScrollX = useTransform(hScrollProgress, [0, 1], ["0%", "-80%"]);

  // --- Section 4: Products progress ---
  const productsRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: productsProgress } = useScroll({
    target: productsRef,
    offset: ["start start", "end end"]
  });
  const [activeProduct, setActiveProduct] = useState(0);
  useMotionValueEvent(productsProgress, "change", (latest) => {
    const idx = Math.min(SERVICES.length - 1, Math.floor(latest * SERVICES.length));
    setActiveProduct(idx);
  });

  // --- Section 5: Testimonials (whileInView) ---

  return (
    <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">

      {/* ===== SECTION 1: Full-Screen Hero ===== */}
      <div ref={heroRef} className="relative">
        <motion.section
          style={{
            opacity: heroOpacity,
            scale: heroScale,
            filter: useTransform(heroBlurRaw, (v) => `blur(${v}px)`),
          }}
          className="h-screen flex flex-col items-center justify-center text-center px-6 lg:px-24 relative"
        >
          {/* Logo */}
          <motion.img
            src="/gitwixlogo.png"
            alt="Gitwix"
            className="w-20 h-20 lg:w-28 lg:h-28 object-contain mb-8"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />

          {/* Subtitle */}
          <motion.span
            className="text-cyan-400 font-mono text-[10px] lg:text-xs tracking-[0.5em] uppercase mb-8 block"
            initial={{ opacity: 0, letterSpacing: "0.8em" }}
            animate={{ opacity: 1, letterSpacing: "0.5em" }}
            transition={{ duration: 1, delay: 0.4 }}
          >
            Web Developer in Manchester
          </motion.span>

          {/* Headlines */}
          <div className="mb-8">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.6 }}>
              <ExplodingText text="BESPOKE" className="text-[12vw] lg:text-[7vw] font-display font-black leading-[0.85] tracking-tighter" />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.8 }}>
              <ExplodingText text="WEBSITES" className="text-[12vw] lg:text-[7vw] font-display font-black leading-[0.85] tracking-tighter text-outline italic" />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 1.0 }}>
              <ExplodingText text="THAT CONVERT." className="text-[12vw] lg:text-[7vw] font-display font-black leading-[0.85] tracking-tighter" />
            </motion.div>
          </div>

          {/* Description */}
          <motion.p
            className="text-base lg:text-lg text-white/40 max-w-xl leading-relaxed font-light mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.2 }}
          >
            We design and build custom websites, e-commerce stores and web applications for businesses across the UK. Fast, SEO-optimised, and built to generate real enquiries — starting from £200.
          </motion.p>

          {/* CTAs */}
          <motion.div
            className="flex flex-col sm:flex-row gap-6 items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.4 }}
          >
            <button onClick={() => setCurrentPage('book')} className="group flex items-center gap-4 text-sm font-bold tracking-[0.3em] uppercase">
              <span>Book a meeting</span>
              <div className="w-12 h-12 border border-white/20 rounded-full flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all duration-500 group-hover:scale-110">
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>
            <a href="https://gitwix.com/free-mockup" target="_blank" rel="noopener noreferrer" className="group flex items-center gap-4 text-sm font-bold tracking-[0.3em] uppercase text-cyan-400">
              <span>Free Mockup</span>
              <ExternalLink className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </a>
          </motion.div>

          {/* Scroll indicator */}
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 scroll-indicator">
            <span className="text-[9px] uppercase tracking-[0.4em] text-white/20 font-mono">Scroll</span>
            <ChevronRight className="w-4 h-4 text-white/30 rotate-90" />
          </div>
        </motion.section>
      </div>

      {/* ===== SECTION 2: Stats Counter ===== */}
      <section ref={statsRef} className="relative">
        <div className="flex flex-col lg:flex-row min-h-[150vh]">
          {/* Left: Sticky */}
          <div className="lg:w-2/5 lg:h-screen lg:sticky lg:top-0 flex flex-col justify-center px-8 lg:px-24 py-16">
            <span className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase mb-6 block">01 — Track Record</span>
            <h2 className="text-6xl lg:text-8xl font-display font-black tracking-tighter leading-[0.85] mb-8">
              Results that<br />
              <span className="text-outline italic">speak.</span>
            </h2>
            {/* Growing vertical line */}
            <div className="relative h-32 w-[2px] bg-white/5 overflow-hidden mt-8 hidden lg:block">
              <motion.div
                className="absolute top-0 left-0 w-full bg-cyan-400"
                style={{ height: lineHeight }}
              />
            </div>
          </div>

          {/* Right: Scrolling stat cards with parallax */}
          <div className="lg:w-3/5 px-8 lg:px-24 py-16 lg:py-32 relative z-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              {STATS.map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 60 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: i * 0.15 }}
                  viewport={{ once: true, margin: "-100px" }}
                  className="p-10 border border-white/5 rounded-3xl hover:border-cyan-400/20 transition-all group bg-black/90"
                >
                  <h4 className="text-6xl lg:text-7xl font-display font-black mb-3 text-white group-hover:text-cyan-400 transition-colors">
                    <CountUp target={s.target} suffix={s.suffix} />
                  </h4>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-white/30">{s.label}</p>
                </motion.div>
              ))}
            </div>

            {/* Expanding rule */}
            <motion.div
              className="h-[1px] bg-white/10 mt-16 mb-16 origin-left"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              viewport={{ once: true }}
            />

            {/* Additional context */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="max-w-md"
            >
              <p className="text-white/40 font-light leading-relaxed text-lg">
                Every project is delivered on time, on budget, and built to the highest standards. Our clients stay because the results are undeniable.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== SECTION 3: Horizontal Scroll — Why Gitwix ===== */}
      <section ref={hScrollRef} style={{ height: '350vh' }} className="relative">
        <div className="sticky top-0 h-screen overflow-hidden flex items-center">
          {/* Section label */}
          <div className="absolute top-24 left-8 lg:left-24 z-10">
            <span className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase block">02 — Why Gitwix</span>
          </div>

          <motion.div
            style={{ x: hScrollX }}
            className="horizontal-scroll-container gap-8 pl-8 lg:pl-24 pr-[20vw]"
          >
            {WHY_GITWIX.map((card, i) => (
              <motion.div
                key={i}
                className="min-w-[85vw] lg:min-w-[60vw] h-[70vh] p-12 lg:p-16 rounded-3xl border border-white/5 card-glow flex flex-col justify-between relative overflow-hidden"
                initial={{ opacity: 0.3 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: false, amount: 0.3 }}
                transition={{ duration: 0.6 }}
              >
                {/* Background number */}
                <div className="number-outline absolute -top-6 -right-4 select-none pointer-events-none">
                  {card.num}
                </div>

                <div className="relative z-10 mt-auto">
                  <span className="text-cyan-400 font-mono text-[11px] tracking-[0.4em] uppercase mb-4 block">{card.num}</span>
                  <h3 className="text-4xl lg:text-6xl font-display font-black mb-6 tracking-tight leading-[0.9]">
                    {card.title}
                  </h3>
                  <p className="text-white/40 font-light leading-relaxed text-lg max-w-lg">
                    {card.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ===== SECTION 4: Products ===== */}
      <section ref={productsRef} className="relative">
        <div className="flex flex-col lg:flex-row min-h-[250vh]">
          {/* Left: Sticky with progress dots */}
          <div className="lg:w-2/5 lg:h-screen lg:sticky lg:top-0 flex flex-col justify-center px-8 lg:px-24 py-24">
            <span className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase mb-6 block">03 — What We Build</span>
            <h2 className="text-5xl lg:text-7xl font-display font-black mb-6 tracking-tight leading-[0.9]">
              Products that<br />
              <span className="text-outline italic">grow with you.</span>
            </h2>
            <p className="text-lg text-white/40 font-light max-w-md leading-relaxed mb-8">
              One-time build + monthly maintenance. Click any product to see full details and pricing.
            </p>

            {/* Progress dots */}
            <div className="hidden lg:flex flex-col gap-3 mt-4">
              {SERVICES.map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full transition-all duration-500 ${i === activeProduct ? 'bg-cyan-400 scale-125' : 'bg-white/10'}`} />
                  <span className={`text-[10px] uppercase tracking-widest transition-colors duration-500 ${i === activeProduct ? 'text-white' : 'text-white/20'}`}>
                    {SERVICES[i].title}
                  </span>
                </div>
              ))}
            </div>

            {/* Floating logo */}
            <img src="/gitwixlogo.png" alt="" className="w-10 h-10 mt-8 opacity-20 hidden lg:block" />
          </div>

          {/* Right: Product cards with reveal animations */}
          <div className="lg:w-3/5 px-8 lg:px-24 py-16 lg:py-32 space-y-12">
            {SERVICES.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 60, rotateX: 5 }}
                whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                transition={{ duration: 0.8, delay: 0.1 }}
                viewport={{ once: true, margin: "-80px" }}
                onClick={() => { setSelectedService(i); setCurrentPage('services'); }}
                className="cursor-pointer"
                style={{ perspective: 800 }}
              >
                <div className="p-8 lg:p-10 border border-white/10 rounded-2xl hover:border-cyan-400/30 group transition-all card-glow">
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-12 h-12 border border-white/10 rounded-full flex items-center justify-center group-hover:border-cyan-400 transition-colors">
                      <s.icon className="w-5 h-5 text-white/40 group-hover:text-cyan-400" />
                    </div>
                    <span className="text-cyan-400 font-bold text-lg">{s.price}</span>
                  </div>
                  <h3 className="text-2xl lg:text-3xl font-display font-bold mb-2 group-hover:text-cyan-400 transition-colors">{s.title}</h3>
                  <p className="text-white/40 font-light leading-relaxed mb-4">{s.desc}</p>
                  <div className="flex items-center justify-between mt-6">
                    <span className="text-[10px] uppercase tracking-widest text-white/20">{s.monthly} · {s.buildTime}</span>
                    <div className="flex items-center gap-2 text-cyan-400 text-sm">
                      <span>View details</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SECTION 5: Testimonials ===== */}
      <section className="relative py-32 px-6 lg:px-24">
        <div className="mb-16">
          <span className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase block">04 — Client Stories</span>
        </div>
        <div className="flex flex-col items-center gap-8">
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true, amount: 0.3 }}
              className="w-full max-w-2xl border border-white/10 rounded-2xl p-8 lg:p-12 glass-panel"
            >
              <div className="flex gap-1 mb-6">
                {[...Array(t.stars)].map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-cyan-400 text-cyan-400" />
                ))}
              </div>
              <p className="text-white/70 font-light italic leading-relaxed text-lg mb-8">
                "{t.quote}"
              </p>
              <div>
                <p className="text-sm font-bold uppercase tracking-widest">{t.name}</p>
                <p className="text-[10px] text-white/30 uppercase tracking-widest mt-1">{t.role}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ===== SECTION 6: Full-Screen CTA ===== */}
      <section className="relative h-screen flex items-center justify-center px-6 lg:px-24 overflow-hidden">
        {/* Gradient pulse background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ animation: 'gradientPulse 4s ease-in-out infinite' }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,255,255,0.08),transparent_70%)]" />
        </div>

        <div className="relative z-10 text-center max-w-3xl">
          <motion.h2
            className="text-5xl lg:text-8xl font-display font-black mb-8 tracking-tight leading-[0.9]"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
            viewport={{ once: true }}
          >
            Ready to<br />
            <span className="text-outline italic">build?</span>
          </motion.h2>
          <motion.p
            className="text-white/40 mb-12 font-light text-lg max-w-lg mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
          >
            Get a free homepage mockup — no commitment required. See what we can build for your business before you spend a penny.
          </motion.p>
          <motion.div
            className="flex flex-col sm:flex-row gap-6 justify-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            viewport={{ once: true }}
          >
            <button onClick={() => setCurrentPage('book')} className="px-12 py-5 bg-white text-black rounded-full text-[10px] uppercase tracking-[0.3em] font-black hover:bg-cyan-400 hover:scale-105 transition-all">
              Book a Meeting
            </button>
            <a href="https://calendly.com/admin-gitwix/30min" target="_blank" rel="noopener noreferrer" className="px-12 py-5 border border-white/20 rounded-full text-[10px] uppercase tracking-[0.3em] font-black hover:bg-white/5 transition-colors flex items-center justify-center gap-2">
              <CalendarDays className="w-4 h-4" /> Calendly
            </a>
          </motion.div>
        </div>
      </section>

    </motion.div>
  );
}



// ============================
// MAIN APP
// ============================
export default function App() {
  const [mode, setMode] = useState<'intro' | 'cursor' | 'hand'>('intro');
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [subscribeEmail, setSubscribeEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [selectedService, setSelectedService] = useState<number | null>(null);
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

  const voiceName = useVoiceField();
  const voiceEmail = useVoiceField(true);
  const voiceDetails = useVoiceField();
  const voiceSubscribe = useVoiceField(true);

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
      setToast({ show: true, message: 'AI Refinement failed. Check your API key.' });
      setTimeout(() => setToast({ show: false, message: '' }), 3000);
    } finally {
      setIsRefining(false);
    }
  };

  const handleEnterSite = (selectedMode: 'cursor' | 'hand') => {
    if (selectedMode === 'hand') {
      setMode('hand');
      setIsCalibrating(true);
    } else {
      setMode('cursor');
      setShowSubscribe(true);
    }
  };

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (subscribeEmail) {
      setSubscribed(true);
      setToast({ show: true, message: 'Subscribed successfully' });
      setTimeout(() => setToast({ show: false, message: '' }), 3000);
      setTimeout(() => setShowSubscribe(false), 1500);
    }
  };

  const getMagneticElement = useCallback((x: number, y: number) => {
    const elements = document.querySelectorAll('button, a, input, textarea, [role="button"]');
    let closest: HTMLElement | null = null;
    let minDistance = Infinity;
    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      // Skip elements not visible or off-screen
      if (rect.width === 0 || rect.height === 0) return;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      // Form inputs and textareas get a much larger magnetic pull
      const isFormField = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
      const radius = isFormField ? MAGNETIC_RADIUS_FORM : MAGNETIC_RADIUS;
      if (distance < radius && distance < minDistance) { minDistance = distance; closest = el as HTMLElement; }
    });
    return closest;
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aboutIframeRef = useRef<HTMLIFrameElement>(null);
  const currentPageRef = useRef<Page>('home');
  const prevHandY = useRef<number | null>(null);
  const lastClickTime = useRef<number>(0);
  const smoothedPos = useRef({ x: 0, y: 0 });
  const lastTrackingTime = useRef<number>(0);
  const interactionModeRef = useRef<'scroll' | 'click'>('scroll');
  const wasTapping = useRef<boolean>(false);
  const lastHoveredElement = useRef<HTMLElement | null>(null);
  const targetScrollY = useRef<number>(0);
  const currentScrollY = useRef<number>(0);
  // Dwell-lock: when cursor stays near the same spot, lock onto the magnetic element
  const dwellCounter = useRef<number>(0);
  const dwellLockedElement = useRef<HTMLElement | null>(null);
  const prevSmoothedPos = useRef({ x: 0, y: 0 });
  // Iframe scroll dampening — accumulates raw delta, sends smoothed
  const iframeScrollAccum = useRef<number>(0);

  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  const handleAboutIframeLoad = useCallback(() => {
    if (mode === 'hand' && aboutIframeRef.current?.contentWindow) {
      aboutIframeRef.current.contentWindow.postMessage({ type: 'gitwix-hand-enter' }, '*');
    }
  }, [mode]);

  const isFingerExtended = (landmarks: any, tipIdx: number, knuckleIdx: number) => {
    const wrist = landmarks[0]; const tip = landmarks[tipIdx]; const knuckle = landmarks[knuckleIdx];
    return Math.sqrt((tip.x - wrist.x)**2 + (tip.y - wrist.y)**2) > Math.sqrt((knuckle.x - wrist.x)**2 + (knuckle.y - wrist.y)**2);
  };

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 2000);
    navigator.mediaDevices?.getUserMedia({ audio: true }).then(stream => { stream.getTracks().forEach(track => track.stop()); }).catch(() => {});
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let rafId: number;
    const updateScroll = () => {
      // Smooth main page scrolling
      const diff = targetScrollY.current - currentScrollY.current;
      if (Math.abs(diff) > 0.1) { currentScrollY.current += diff * SCROLL_SMOOTHING; window.scrollTo(0, currentScrollY.current); }
      // Drain iframe scroll accumulator smoothly between hand-tracking frames
      if (currentPageRef.current === 'about' && Math.abs(iframeScrollAccum.current) > 0.5 && aboutIframeRef.current?.contentWindow) {
        const drain = iframeScrollAccum.current * IFRAME_SCROLL_DAMPENING;
        iframeScrollAccum.current -= drain;
        if (Math.abs(drain) > 0.5) {
          aboutIframeRef.current.contentWindow.postMessage({ type: 'gitwix-hand-scroll', delta: drain }, '*');
        }
      } else if (Math.abs(iframeScrollAccum.current) <= 0.5) {
        iframeScrollAccum.current = 0;
      }
      rafId = requestAnimationFrame(updateScroll);
    };
    rafId = requestAnimationFrame(updateScroll);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // --- MEDIAPIPE HAND TRACKING ---
  useEffect(() => {
    if (mode === 'intro') return;
    if (!videoRef.current || !canvasRef.current) return;
    let isMounted = true;
    let camera_mp: any = null;
    const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });

    hands.onResults((results: Results) => {
      if (!isMounted) return;
      if (isCalibrating) { setIsCalibrating(false); }
      const canvasCtx = canvasRef.current?.getContext('2d');
      if (!canvasCtx || !canvasRef.current) return;
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        setHandDetected(true);
        lastTrackingTime.current = Date.now();
        const landmarks = results.multiHandLandmarks[0];
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FFFF', lineWidth: 2 });
        drawLandmarks(canvasCtx, landmarks, { color: '#FFFFFF', lineWidth: 1, radius: 2 });

        const indexExtended = isFingerExtended(landmarks, 8, 5);
        const middleExtended = isFingerExtended(landmarks, 12, 9);
        const ringExtended = isFingerExtended(landmarks, 16, 13);
        const pinkyExtended = isFingerExtended(landmarks, 20, 17);
        const extendedCount = [indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;

        if (extendedCount >= 4) {
          if (interactionModeRef.current !== 'scroll') { interactionModeRef.current = 'scroll'; setInteractionMode('scroll'); prevHandY.current = null; }
        } else if (extendedCount <= 1) {
          if (interactionModeRef.current !== 'click') { interactionModeRef.current = 'click'; setInteractionMode('click'); }
        }

        const cursorTarget = (interactionModeRef.current === 'click' && indexExtended) ? landmarks[8] : landmarks[9];
        const expandedX = (cursorTarget.x - 0.5) * CURSOR_RANGE_SCALE + 0.5;
        const expandedY = (cursorTarget.y - 0.5) * CURSOR_RANGE_SCALE + 0.5;
        const clampedX = Math.max(0, Math.min(1, expandedX));
        const clampedY = Math.max(0, Math.min(1, expandedY));
        const targetX = (1 - clampedX) * window.innerWidth;
        const targetY = clampedY * window.innerHeight;
        // Heavier smoothing in click mode for stable targeting, lighter in scroll
        const smoothingFactor = interactionModeRef.current === 'click' ? CURSOR_SMOOTHING_CLICK : CURSOR_SMOOTHING_SCROLL;
        smoothedPos.current.x += (targetX - smoothedPos.current.x) * smoothingFactor;
        smoothedPos.current.y += (targetY - smoothedPos.current.y) * smoothingFactor;

        // Dwell-lock: if cursor barely moves for several frames, lock onto nearest element
        const moveDist = Math.sqrt(
          (smoothedPos.current.x - prevSmoothedPos.current.x) ** 2 +
          (smoothedPos.current.y - prevSmoothedPos.current.y) ** 2
        );
        prevSmoothedPos.current = { ...smoothedPos.current };

        const magneticElement = getMagneticElement(smoothedPos.current.x, smoothedPos.current.y);

        if (interactionModeRef.current === 'click' && magneticElement) {
          if (moveDist < CURSOR_DWELL_LOCK_RADIUS) {
            dwellCounter.current++;
          } else {
            dwellCounter.current = 0;
            dwellLockedElement.current = null;
          }
          // After dwelling near an element for enough frames, hard-lock cursor onto it
          if (dwellCounter.current >= CURSOR_DWELL_LOCK_FRAMES) {
            dwellLockedElement.current = magneticElement;
          }
        } else {
          dwellCounter.current = 0;
          dwellLockedElement.current = null;
        }

        // Use dwell-locked element if available, otherwise nearest magnetic element
        const snapTarget = dwellLockedElement.current || magneticElement;
        if (snapTarget) {
          const rect = snapTarget.getBoundingClientRect();
          setCursorPos({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        } else {
          setCursorPos({ x: smoothedPos.current.x, y: smoothedPos.current.y });
        }

        // Hand hover simulation
        const hx = snapTarget ? (snapTarget.getBoundingClientRect().left + snapTarget.getBoundingClientRect().width / 2) : smoothedPos.current.x;
        const hy = snapTarget ? (snapTarget.getBoundingClientRect().top + snapTarget.getBoundingClientRect().height / 2) : smoothedPos.current.y;
        const hoveredEl = (snapTarget || document.elementFromPoint(hx, hy)) as HTMLElement | null;
        const findHoverTarget = (el: HTMLElement | null): HTMLElement | null => {
          let current = el;
          while (current && current !== document.body) {
            if (current.matches('button, a, [role="button"], .group, input, textarea')) return current;
            if (current.parentElement?.matches('.group')) return current.parentElement;
            current = current.parentElement as HTMLElement | null;
          }
          return el;
        };
        const hoverTarget = findHoverTarget(hoveredEl);
        if (lastHoveredElement.current !== hoverTarget) {
          if (lastHoveredElement.current) {
            lastHoveredElement.current.classList.remove(HAND_HOVER_CLASS);
            lastHoveredElement.current.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
            let ancestor = lastHoveredElement.current.closest('.group') as HTMLElement | null;
            if (ancestor) ancestor.classList.remove(HAND_HOVER_CLASS);
          }
          if (hoverTarget) {
            hoverTarget.classList.add(HAND_HOVER_CLASS);
            hoverTarget.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            let ancestor = hoverTarget.closest('.group') as HTMLElement | null;
            if (ancestor && ancestor !== hoverTarget) ancestor.classList.add(HAND_HOVER_CLASS);
          }
          lastHoveredElement.current = hoverTarget;
        }

        if (interactionModeRef.current === 'click') {
          prevHandY.current = null;
          const thumbTip = landmarks[4]; const indexTip = landmarks[8];
          const dist = Math.sqrt((thumbTip.x - indexTip.x)**2 + (thumbTip.y - indexTip.y)**2);
          const isPinchingGesture = dist < 0.042;
          setPinchProgress(Math.max(0, 1 - (dist / 0.09)));
          if (isPinchingGesture && !wasTapping.current) {
            const now = Date.now();
            if (now - lastClickTime.current > CLICK_DEBOUNCE_MS) {
              // Check if clicking a nav element first (nav must remain functional on about page)
              const navElement = getMagneticElement(smoothedPos.current.x, smoothedPos.current.y);
              const isNavClick = navElement && navElement.closest('nav');

              if (currentPageRef.current === 'about' && aboutIframeRef.current?.contentWindow && !isNavClick) {
                // Forward click to the immersive iframe
                setClickFeedback({ x: smoothedPos.current.x, y: smoothedPos.current.y });
                setTimeout(() => setClickFeedback(null), 400);
                aboutIframeRef.current.contentWindow.postMessage({ type: 'gitwix-hand-click', x: smoothedPos.current.x, y: smoothedPos.current.y }, '*');
              } else {
                const me = getMagneticElement(smoothedPos.current.x, smoothedPos.current.y);
                const element = me || document.elementFromPoint(smoothedPos.current.x, smoothedPos.current.y);
                if (element instanceof HTMLElement) {
                  const rect = element.getBoundingClientRect();
                  setClickFeedback({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                  setTimeout(() => setClickFeedback(null), 400);
                  element.click();
                  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') element.focus();
                }
              }
              lastClickTime.current = now;
            }
          }
          wasTapping.current = isPinchingGesture;
        } else if (interactionModeRef.current === 'scroll') {
          wasTapping.current = false; setPinchProgress(0);
          dwellCounter.current = 0; dwellLockedElement.current = null;
          const currentY = landmarks[9].y;
          if (prevHandY.current !== null) {
            // When on About page, use reduced sensitivity and dampened scrolling
            if (currentPageRef.current === 'about' && aboutIframeRef.current?.contentWindow) {
              const rawDelta = (prevHandY.current - currentY) * window.innerHeight * IFRAME_SCROLL_SENSITIVITY;
              // Accumulate and dampen — sends a smoothed portion each frame
              iframeScrollAccum.current += rawDelta;
              const smoothedDelta = iframeScrollAccum.current * IFRAME_SCROLL_DAMPENING;
              iframeScrollAccum.current -= smoothedDelta;
              if (Math.abs(smoothedDelta) > 0.5) {
                aboutIframeRef.current.contentWindow.postMessage({ type: 'gitwix-hand-scroll', delta: smoothedDelta }, '*');
              }
            } else {
              const deltaY = (prevHandY.current - currentY) * window.innerHeight * SCROLL_SENSITIVITY;
              if (Math.abs(deltaY) > 2) {
                targetScrollY.current = Math.max(0, Math.min(document.documentElement.scrollHeight - window.innerHeight, targetScrollY.current + deltaY));
              }
            }
          }
          prevHandY.current = currentY;
        }
      } else {
        if (Date.now() - lastTrackingTime.current > TRACKING_LOST_TIMEOUT) setHandDetected(false);
        prevHandY.current = null; setPinchProgress(0);
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
      onFrame: async () => { if (!isMounted) return; try { await hands.send({ image: videoRef.current! }); } catch (err) {} },
      width: 640, height: 480,
    });

    const calibrationTimeout = setTimeout(() => { if (isCalibrating && isMounted) setIsCalibrating(false); }, 10000);
    const startTimeout = setTimeout(async () => {
      if (!isMounted) return;
      try { setCameraError(null); await camera_mp.start(); } catch (err: any) { if (isMounted) setCameraError(err?.message || String(err)); }
    }, 800);

    return () => { isMounted = false; clearTimeout(calibrationTimeout); clearTimeout(startTimeout); if (camera_mp) camera_mp.stop(); hands.close(); };
  }, [mode]);

  useEffect(() => {
    currentPageRef.current = currentPage;
    targetScrollY.current = 0; currentScrollY.current = 0; window.scrollTo(0, 0);
    iframeScrollAccum.current = 0;
    dwellCounter.current = 0; dwellLockedElement.current = null;
    if (currentPage !== 'services') setSelectedService(null);
  }, [currentPage]);

  useEffect(() => {
    if (currentPage === 'about' && mode === 'hand' && aboutIframeRef.current?.contentWindow) {
      const timer = setTimeout(() => {
        aboutIframeRef.current?.contentWindow?.postMessage({ type: 'gitwix-hand-enter' }, '*');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [currentPage, mode]);

  // ============================
  // RENDER
  // ============================
  return (
    <div className="relative w-full min-h-screen bg-black text-white selection:bg-white/30 overflow-x-hidden font-sans">
      {/* Three.js Background */}
      <div className="fixed inset-0 z-[0] pointer-events-none" style={{ opacity: 0.15 }}>
        <Canvas><Suspense fallback={null}><Scene scrollProgress={scrollYProgress} cursorPos={cursorPos} currentPage={currentPage} /></Suspense></Canvas>
      </div>

      {/* Scroll Progress Bar */}
      <motion.div className="fixed top-0 left-0 h-1 bg-cyan-400 z-[100] origin-left" style={{ scaleX }} />

      {/* ===== INTRO SCREEN ===== */}
      <AnimatePresence>
        {mode === 'intro' && (
          <motion.div initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black overflow-hidden">
            <div className="absolute inset-0 opacity-20">
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,#00ffff_0%,transparent_50%)]" />
            </div>
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} className="relative z-10 text-center px-6 max-w-4xl">
              <div className="mb-8 flex flex-col items-center gap-6">
                <img src="/gitwixlogo.png" alt="Gitwix" className="w-24 h-24 lg:w-32 lg:h-32 object-contain" />
                <h2 className="text-[16vw] lg:text-[10vw] font-display font-black leading-none tracking-tighter text-white">GITWIX</h2>
              </div>
              <div className="text-white/40 font-mono text-[10px] tracking-[0.6em] uppercase mb-8">Web Developer &bull; Manchester, Deansgate</div>
              <p className="text-white/40 text-sm lg:text-base tracking-[0.2em] uppercase mb-16 font-light max-w-2xl mx-auto leading-relaxed">
                Bespoke websites, e-commerce stores &amp; web applications<br />built to convert visitors into customers.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
                <button onClick={() => handleEnterSite('cursor')} className="group relative px-12 py-5 bg-white text-black rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95">
                  <span className="relative z-10 font-sans font-black uppercase tracking-[0.3em] text-[10px]">Standard Experience</span>
                  <div className="absolute inset-0 bg-cyan-400 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                </button>
                <button onClick={() => handleEnterSite('hand')} className="group flex items-center gap-4 px-12 py-5 border border-white/10 rounded-full hover:bg-white/5 transition-all hover:border-white/40">
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

      {/* ===== EMAIL SUBSCRIBE OVERLAY ===== */}
      <AnimatePresence>
        {showSubscribe && !subscribed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 backdrop-blur-2xl"
          >
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="relative text-center px-8 max-w-lg w-full"
            >
              <div className="mb-6">
                <div className="w-16 h-16 mx-auto border border-cyan-400/30 rounded-full flex items-center justify-center mb-8">
                  <Mail className="w-7 h-7 text-cyan-400" />
                </div>
                <h2 className="text-4xl lg:text-5xl font-display font-black mb-4 tracking-tight">Stay in the loop</h2>
                <p className="text-white/40 text-sm tracking-wide leading-relaxed max-w-sm mx-auto">
                  Get notified about new projects, insights, and exclusive offers. Click the field below and speak your email.
                </p>
              </div>

              <form onSubmit={handleSubscribe} className="mt-10 space-y-6">
                <div className="relative">
                  <SpeakNowBadge visible={voiceSubscribe.isListening} />
                  <div className="relative border border-white/10 rounded-full overflow-hidden focus-within:border-cyan-400/50 transition-colors bg-white/5">
                    <input
                      type="email"
                      required
                      value={subscribeEmail}
                      onChange={(e) => setSubscribeEmail(e.target.value)}
                      onFocus={() => voiceSubscribe.startListening((text) => setSubscribeEmail(text))}
                      onBlur={() => voiceSubscribe.stopListening()}
                      className="w-full bg-transparent px-8 py-5 outline-none text-base font-light placeholder:text-white/20 pr-32"
                      placeholder="your@email.com"
                    />
                    <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-3 bg-white text-black rounded-full text-[9px] uppercase tracking-[0.3em] font-black hover:bg-cyan-400 transition-colors">
                      Subscribe
                    </button>
                  </div>
                </div>
              </form>

              <button
                onClick={() => setShowSubscribe(false)}
                className="mt-8 text-[10px] uppercase tracking-[0.4em] text-white/30 hover:text-white/60 transition-colors"
              >
                Skip for now
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast.show && (
          <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[200] bg-white text-black px-8 py-4 rounded-full font-display font-bold text-sm shadow-2xl flex items-center gap-4">
            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hand Mode UI */}
      {mode === 'hand' && (
        <>
          <VirtualCursor cursorPos={cursorPos} pinchProgress={pinchProgress} interactionMode={interactionMode} clickFeedback={clickFeedback} />
          <div className="fixed bottom-8 right-8 z-50 group">
            <div className="relative w-48 h-32 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-500 group-hover:w-64 group-hover:h-48">
              <video ref={videoRef} className="absolute opacity-0 pointer-events-none" playsInline muted width="640" height="480" />
              <canvas ref={canvasRef} className="w-full h-full object-cover opacity-60" />
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${handDetected ? 'bg-white animate-pulse' : 'bg-white/20'}`} />
                <span className="text-[8px] uppercase tracking-widest font-bold text-white/40">{handDetected ? 'AI Tracking Active' : 'Searching...'}</span>
              </div>
            </div>
          </div>
          {isCalibrating && (
            <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/80 backdrop-blur-2xl">
              <div className="relative mb-12">
                <div className="absolute inset-0 bg-cyan-400/20 blur-3xl rounded-full animate-pulse" />
                {cameraError ? (
                  <div className="relative z-10 w-20 h-20 flex items-center justify-center bg-red-500/20 rounded-full border border-red-500/50"><Hand className="w-10 h-10 text-red-500" /></div>
                ) : (
                  <Loader2 className="relative z-10 w-20 h-20 animate-spin text-cyan-400" />
                )}
              </div>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center px-6">
                <h2 className="text-[14px] tracking-[0.8em] uppercase font-black text-white mb-4">{cameraError ? 'Hardware Conflict' : 'Neural Calibration'}</h2>
                <p className="text-[10px] tracking-[0.3em] uppercase text-white/40 max-w-sm mx-auto leading-relaxed mb-12">
                  {cameraError ? (<>Failed to acquire camera feed: <span className="text-red-400/60">{cameraError}</span>. Please ensure your camera is not in use.</>) : (<>Syncing spatial sensors. Please ensure your hand is visible to the camera.</>)}
                </p>
                <div className="flex flex-col items-center gap-4">
                  {cameraError && <button onClick={() => window.location.reload()} className="px-8 py-3 bg-white text-black rounded-full text-[9px] uppercase tracking-[0.4em] font-black hover:scale-105 transition-all">Restart</button>}
                  <button onClick={() => { setIsCalibrating(false); setCameraError(null); }} className="px-8 py-3 border border-white/10 rounded-full text-[9px] uppercase tracking-[0.4em] text-white/40 hover:text-white hover:border-white/40 transition-all">{cameraError ? 'Continue without AI' : 'Skip Calibration'}</button>
                </div>
              </motion.div>
            </div>
          )}
        </>
      )}

      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-40 px-6 lg:px-12 py-6 lg:py-10 flex items-center justify-between transition-all duration-1000 ${mode === 'intro' ? 'opacity-0 -translate-y-10' : 'opacity-100 translate-y-0'}`}>
        <div className="cursor-pointer flex items-center gap-3 group" onClick={() => setCurrentPage('home')}>
          <img src="/gitwixlogo.png" alt="Gitwix" className="w-8 h-8 object-contain" />
          <span className="tracking-[0.2em] font-sans font-black text-sm">GITWIX</span>
        </div>
        <div className="flex items-center space-x-6 lg:space-x-12">
          {(['home', 'services', 'portfolio', 'about', 'book'] as Page[]).map((p) => (
            <button key={p} onClick={() => setCurrentPage(p)} className={`text-[10px] lg:text-[11px] uppercase tracking-[0.3em] lg:tracking-[0.4em] font-sans font-bold transition-all relative group ${currentPage === p ? 'text-white' : 'text-white/40 hover:text-white'}`}>
              {p === 'book' ? 'Book' : p}
              <span className={`absolute -bottom-2 left-0 h-[1px] bg-white transition-all duration-500 ${currentPage === p ? 'w-full' : 'w-0 group-hover:w-full'}`} />
            </button>
          ))}
        </div>
      </nav>

      {/* ===== MAIN CONTENT ===== */}
      <main className={`relative z-[5] transition-opacity duration-1000 ${mode === 'intro' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <AnimatePresence mode="wait">

          {/* ==================== HOME ==================== */}
          {currentPage === 'home' && (
            <HomePageContent setCurrentPage={setCurrentPage} setSelectedService={setSelectedService} />
          )}

          {/* ==================== SERVICES ==================== */}
          {currentPage === 'services' && selectedService !== null && SERVICES[selectedService] && (() => {
            const s = SERVICES[selectedService];
            return (
              <motion.div key="service-detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
                <div className="flex flex-col lg:flex-row min-h-screen">
                  {/* Left: Sticky panel with pricing summary + CTA */}
                  <div className="lg:w-1/2 lg:h-screen lg:sticky lg:top-0 flex flex-col justify-center px-8 lg:px-24 py-24">
                    <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }}>
                      <button onClick={() => setSelectedService(null)} className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-white/40 hover:text-white transition-colors mb-12">
                        <ArrowLeft className="w-4 h-4" /> Back to Services
                      </button>
                      <div className="w-16 h-16 border border-cyan-400/30 rounded-full flex items-center justify-center mb-8">
                        <s.icon className="w-7 h-7 text-cyan-400" />
                      </div>
                      <h2 className="text-4xl lg:text-6xl font-display font-black mb-6 tracking-tight">{s.title}</h2>
                      <div className="flex flex-wrap gap-6 mb-8 text-sm">
                        <div>
                          <span className="text-[10px] uppercase tracking-widest text-white/30 block mb-1">One-time build</span>
                          <span className="text-2xl font-display font-black text-cyan-400">{s.price}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-widest text-white/30 block mb-1">Monthly</span>
                          <span className="text-2xl font-display font-black">{s.monthly}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-widest text-white/30 block mb-1">Timeline</span>
                          <span className="text-2xl font-display font-black">{s.buildTime}</span>
                        </div>
                      </div>
                      <p className="text-lg text-white/40 font-light leading-relaxed mb-12">{s.desc}</p>
                      <div className="flex flex-col sm:flex-row gap-4">
                        <button onClick={() => setCurrentPage('book')} className="px-10 py-4 bg-white text-black rounded-full text-[10px] uppercase tracking-[0.3em] font-black hover:bg-cyan-400 transition-colors">Book a Meeting</button>
                        <a href="https://gitwix.com/free-mockup" target="_blank" rel="noopener noreferrer" className="px-10 py-4 border border-white/20 rounded-full text-[10px] uppercase tracking-[0.3em] font-black hover:bg-white/5 transition-colors flex items-center justify-center gap-2">
                          <ExternalLink className="w-4 h-4" /> Get Free Mockup
                        </a>
                      </div>
                    </motion.div>
                  </div>

                  {/* Right: Scrolling content with included items */}
                  <div className="lg:w-1/2 px-8 lg:px-24 py-24 lg:py-48 space-y-24">
                    {/* What's Included (Build) */}
                    <section>
                      <span className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase mb-8 block">What's Included (Build)</span>
                      <div className="space-y-4">
                        {s.included.map((item, j) => (
                          <motion.div key={j} initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: j * 0.05 }} viewport={{ once: true }} className="flex items-center gap-4 p-4 border border-white/5 rounded-xl hover:border-cyan-400/20 transition-colors">
                            <Check className="w-5 h-5 text-cyan-400 shrink-0" />
                            <span className="text-white/70 font-light">{item}</span>
                          </motion.div>
                        ))}
                      </div>
                    </section>

                    {/* Monthly Plan Includes */}
                    <section>
                      <span className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase mb-8 block">Monthly Plan Includes</span>
                      <div className="space-y-4">
                        {s.monthlyIncludes.map((item, j) => (
                          <motion.div key={j} initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: j * 0.05 }} viewport={{ once: true }} className="flex items-center gap-4 p-4 border border-white/5 rounded-xl hover:border-cyan-400/20 transition-colors">
                            <Check className="w-5 h-5 text-cyan-400 shrink-0" />
                            <span className="text-white/70 font-light">{item}</span>
                          </motion.div>
                        ))}
                      </div>
                    </section>

                    {/* Features badges */}
                    <section>
                      <span className="text-[10px] font-mono tracking-[0.4em] text-white/20 uppercase mb-8 block">Key Features</span>
                      <div className="flex flex-wrap gap-3">
                        {s.features.map((f, j) => (
                          <span key={j} className="text-[10px] uppercase tracking-widest text-cyan-400 border border-cyan-400/20 px-4 py-2 rounded-full bg-cyan-400/5">{f}</span>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              </motion.div>
            );
          })()}
          {currentPage === 'services' && selectedService === null && (
            <motion.div key="services" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-screen pt-36 lg:pt-48 px-6 lg:px-24 pb-32">
              <div className="max-w-7xl mx-auto">
                <div className="mb-24">
                  <span className="text-[10px] font-mono tracking-[0.4em] text-white/40 uppercase mb-8 block">What We Build</span>
                  <ExplodingText text="SERVICES" className="text-6xl lg:text-9xl font-display font-black mb-6 tracking-tighter" />
                  <p className="text-lg text-white/40 font-light max-w-2xl leading-relaxed">
                    From simple landing pages to complex web applications — we build everything in-house with modern technology, transparent pricing, and fast turnaround.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-white/5 border border-white/5 mb-32">
                  {SERVICES.map((s, i) => (
                    <motion.div key={i} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ duration: 0.8, delay: i * 0.1 }} className="bg-black p-10 lg:p-16 hover:bg-white/5 transition-all group border border-white/5 cursor-pointer" onClick={() => setSelectedService(i)}>
                      <div className="flex items-center justify-between mb-8">
                        <div className="w-12 h-12 border border-white/10 rounded-full flex items-center justify-center group-hover:border-cyan-400 transition-colors">
                          <s.icon className="w-5 h-5 text-white/40 group-hover:text-cyan-400" />
                        </div>
                        <span className="text-cyan-400 text-sm font-bold">{s.price}</span>
                      </div>
                      <h3 className="text-2xl lg:text-3xl font-display font-bold mb-4 group-hover:text-cyan-400 transition-colors">{s.title}</h3>
                      <p className="text-white/40 font-light leading-relaxed mb-8">{s.desc}</p>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {s.features.map((f, j) => (
                          <span key={j} className="text-[9px] uppercase tracking-widest text-white/30 border border-white/10 px-3 py-1 rounded-full">{f}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-cyan-400 text-sm">
                        <span>View details</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Pricing Summary */}
                <div className="mb-32">
                  <span className="text-[10px] font-mono tracking-[0.4em] text-white/40 uppercase mb-8 block">Transparent Pricing</span>
                  <h2 className="text-4xl lg:text-6xl font-display font-black mb-12 tracking-tight">No hidden fees.</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                      { name: "Website", from: "£200", monthly: "£50/mo", desc: "Landing pages, brochure sites, multi-page websites", time: "1-2 weeks" },
                      { name: "PWA / Web App", from: "£799", monthly: "£150/mo", desc: "Progressive web apps, dashboards, complex applications", time: "2-6 weeks" },
                      { name: "Mobile App", from: "£1,000", monthly: "£250/mo", desc: "iOS and Android apps with native-like performance", time: "4-8 weeks" },
                    ].map((p, i) => (
                      <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }} viewport={{ once: true }} className="p-10 border border-white/10 rounded-3xl hover:border-cyan-400/30 transition-all group">
                        <h3 className="text-xl font-bold mb-2">{p.name}</h3>
                        <div className="flex items-baseline gap-2 mb-4">
                          <span className="text-4xl font-display font-black text-cyan-400">{p.from}</span>
                          <span className="text-white/30 text-sm">+ {p.monthly}</span>
                        </div>
                        <p className="text-white/40 text-sm font-light mb-4">{p.desc}</p>
                        <div className="flex items-center gap-2 text-white/30 text-[10px] uppercase tracking-widest">
                          <Clock className="w-3 h-3" /> {p.time}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* CTA */}
                <div className="text-center">
                  <h3 className="text-3xl font-display font-bold mb-4">Not sure what you need?</h3>
                  <p className="text-white/40 mb-8 font-light">Book a free consultation and we'll recommend the right solution for your business.</p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <button onClick={() => setCurrentPage('book')} className="px-10 py-4 bg-white text-black rounded-full text-[10px] uppercase tracking-[0.3em] font-black hover:bg-cyan-400 transition-colors">Book a Meeting</button>
                    <a href="https://gitwix.com/free-mockup" target="_blank" rel="noopener noreferrer" className="px-10 py-4 border border-white/20 rounded-full text-[10px] uppercase tracking-[0.3em] font-black hover:bg-white/5 transition-colors flex items-center justify-center gap-2">
                      <ExternalLink className="w-4 h-4" /> Get Free Mockup
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ==================== PORTFOLIO ==================== */}
          {currentPage === 'portfolio' && (
            <motion.div key="portfolio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-screen pt-36 lg:pt-48 px-6 lg:px-24 pb-32">
              <div className="max-w-7xl mx-auto">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-24 gap-12">
                  <div>
                    <span className="text-[10px] font-mono tracking-[0.4em] text-white/40 uppercase mb-8 block">Selected Work</span>
                    <ExplodingText text="PORTFOLIO" className="text-6xl lg:text-9xl font-display font-black tracking-tighter" />
                  </div>
                  <p className="text-white/40 text-sm font-light uppercase tracking-widest leading-relaxed lg:text-right">
                    From brief to live — delivered fast,<br />built to last.
                  </p>
                </div>

                <div className="space-y-32">
                  {PORTFOLIO.map((p, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 1 }} viewport={{ once: true }}>
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="group block">
                        <div className="aspect-[16/9] bg-white/5 rounded-3xl overflow-hidden mb-10 relative">
                          <img src={p.img} alt={p.title} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-1000 group-hover:scale-105" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-black/30 group-hover:bg-transparent transition-all" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-24 h-24 bg-white text-black rounded-full flex items-center justify-center text-[10px] uppercase tracking-widest font-bold gap-2">
                              <ExternalLink className="w-4 h-4" /> Visit
                            </div>
                          </div>
                        </div>
                      </a>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        <div>
                          <span className="text-[10px] uppercase tracking-[0.4em] text-cyan-400 mb-2 block">{p.category}</span>
                          <h3 className="text-4xl lg:text-5xl font-display font-bold mb-6">{p.title}</h3>
                          <p className="text-white/40 font-light leading-relaxed text-lg">{p.description}</p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-[0.4em] text-white/30 mb-6 block">Results</span>
                          <div className="space-y-4">
                            {p.results.map((r, j) => (
                              <div key={j} className="flex items-center gap-3">
                                <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                                <span className="text-white/60 font-light">{r}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* CTA */}
                <div className="mt-32 text-center">
                  <h3 className="text-3xl font-display font-bold mb-4">Want results like these?</h3>
                  <p className="text-white/40 mb-8 font-light">Let's discuss your project and show you what we can build.</p>
                  <button onClick={() => setCurrentPage('book')} className="px-10 py-4 bg-white text-black rounded-full text-[10px] uppercase tracking-[0.3em] font-black hover:bg-cyan-400 transition-colors">Start Your Project</button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ==================== ABOUT (GITWIX IMMERSIVE) ==================== */}
          {currentPage === 'about' && (
            <motion.div key="about" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full" style={{ height: 'calc(100vh - 0px)' }}>
              <iframe
                ref={aboutIframeRef}
                src="https://aisebastianfletcher.github.io/GITWIX-immersive/"
                title="GITWIX Immersive Experience"
                className="w-full h-full border-0"
                style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 30 }}
                allow="autoplay; fullscreen; encrypted-media"
                allowFullScreen
                onLoad={handleAboutIframeLoad}
              />
              {/* Back button overlay — sits above the iframe so user can navigate away */}
              <button
                onClick={() => setCurrentPage('home')}
                style={{ position: 'fixed', top: '2.5vh', left: '3vw', zIndex: 40 }}
                className="px-5 py-2 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[10px] uppercase tracking-[0.3em] font-black text-white/70 hover:text-white hover:bg-black/80 transition-all"
              >
                ← Back
              </button>
            </motion.div>
          )}

          {/* ==================== BOOK A MEETING ==================== */}
          {currentPage === 'book' && (
            <motion.div key="book" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full min-h-screen flex items-center justify-center px-6 lg:px-24 py-24">
              <div className="max-w-7xl w-full mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
                  <div>
                    <span className="text-[10px] font-mono tracking-[0.4em] text-white/40 uppercase mb-8 block">Get Started</span>
                    <h2 className="text-5xl lg:text-7xl font-serif italic mb-8 leading-tight">Let's build<br />something great.</h2>
                    <p className="text-lg text-white/50 leading-relaxed font-light mb-12">
                      Book a free consultation to discuss your project. We'll recommend the right solution and provide a clear quote — no obligation.
                    </p>
                    <div className="space-y-6 mb-12">
                      <div className="flex items-center gap-4">
                        <Check className="w-5 h-5 text-cyan-400" />
                        <span className="text-white/60 font-light">Free homepage mockup — no payment upfront</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <Check className="w-5 h-5 text-cyan-400" />
                        <span className="text-white/60 font-light">Usually respond within 24 hours</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <Check className="w-5 h-5 text-cyan-400" />
                        <span className="text-white/60 font-light">Quality work or your money back</span>
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div>
                        <span className="text-[10px] uppercase tracking-widest text-white/30 block mb-2">Email</span>
                        <a href="mailto:admin@gitwix.com" className="text-xl font-serif italic hover:text-cyan-400 transition-colors">admin@gitwix.com</a>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-widest text-white/30 block mb-2">Phone</span>
                        <a href="tel:+4407359168434" className="text-xl font-serif italic hover:text-cyan-400 transition-colors">+44 07359 168434</a>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-widest text-white/30 block mb-2">Office</span>
                        <p className="text-xl font-serif italic">Deansgate, Manchester</p>
                      </div>
                      <div>
                        <a href="https://calendly.com/admin-gitwix/30min" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 text-cyan-400 text-sm font-bold tracking-[0.2em] uppercase hover:text-white transition-colors mt-4">
                          <CalendarDays className="w-4 h-4" /> Book directly on Calendly
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="glass-panel p-10 lg:p-16 rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl">
                    <form className="space-y-10" onSubmit={(e) => {
                      e.preventDefault();
                      setToast({ show: true, message: 'Inquiry received. We\'ll reach out within 24 hours.' });
                      setTimeout(() => setToast({ show: false, message: '' }), 5000);
                    }}>
                      <div className="space-y-8">
                        <div className="relative border-b border-white/10 pb-4 focus-within:border-white transition-colors">
                          <SpeakNowBadge visible={voiceName.isListening} />
                          <label className="text-[10px] uppercase tracking-widest text-white/30 block mb-2">Your Name</label>
                          <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} onFocus={() => voiceName.startListening((text) => setFormData(prev => ({ ...prev, name: text })))} onBlur={() => voiceName.stopListening()} className="w-full bg-transparent outline-none text-xl font-serif italic placeholder:text-white/10" placeholder="Your full name" />
                        </div>
                        <div className="relative border-b border-white/10 pb-4 focus-within:border-white transition-colors">
                          <SpeakNowBadge visible={voiceEmail.isListening} />
                          <label className="text-[10px] uppercase tracking-widest text-white/30 block mb-2">Email Address</label>
                          <input type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} onFocus={() => voiceEmail.startListening((text) => setFormData(prev => ({ ...prev, email: text })))} onBlur={() => voiceEmail.stopListening()} className="w-full bg-transparent outline-none text-xl font-serif italic placeholder:text-white/10" placeholder="you@business.com" />
                        </div>
                        <div className="relative border-b border-white/10 pb-4 focus-within:border-white transition-colors">
                          <SpeakNowBadge visible={voiceDetails.isListening} />
                          <label className="text-[10px] uppercase tracking-widest text-white/30 block mb-2">Project Details</label>
                          <textarea rows={3} value={formData.details} onChange={(e) => setFormData({ ...formData, details: e.target.value })} onFocus={() => voiceDetails.startListening((text) => setFormData(prev => ({ ...prev, details: text })))} onBlur={() => voiceDetails.stopListening()} className="w-full bg-transparent outline-none text-xl font-serif italic placeholder:text-white/10 resize-none" placeholder="Tell us about your project..." />
                          {formData.details && (
                            <button type="button" onClick={handleAIRefine} disabled={isRefining} className="mt-4 flex items-center gap-2 text-[9px] uppercase tracking-widest text-cyan-400 hover:text-white transition-colors disabled:opacity-50">
                              {isRefining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                              {isRefining ? 'Refining...' : 'Refine with AI'}
                            </button>
                          )}
                        </div>
                      </div>
                      <button type="submit" className="w-full py-6 bg-white text-black font-sans font-black uppercase tracking-[0.3em] text-xs rounded-full hover:bg-cyan-400 transition-all active:scale-95">Send Inquiry</button>
                    </form>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="relative z-[5] py-16 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 lg:px-24">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-8">
              <span className="font-sans font-black text-sm tracking-[0.2em]">GITWIX</span>
              <span className="text-[10px] text-white/20 uppercase tracking-widest">Web Developer, Deansgate, Manchester</span>
            </div>
            <div className="flex items-center gap-8">
              <a href="mailto:admin@gitwix.com" className="text-[10px] uppercase tracking-widest text-white/30 hover:text-white transition-colors">admin@gitwix.com</a>
              <a href="tel:+4407359168434" className="text-[10px] uppercase tracking-widest text-white/30 hover:text-white transition-colors">+44 07359 168434</a>
              <a href="https://www.linkedin.com/company/gitwix/" target="_blank" rel="noopener noreferrer" className="text-[10px] uppercase tracking-widest text-white/30 hover:text-white transition-colors">LinkedIn</a>
            </div>
          </div>
          <div className="mt-8 text-center text-[10px] uppercase tracking-[0.5em] font-mono text-white/15">
            &copy; 2026 Gitwix &bull; Bespoke Web Development &bull; Manchester, UK
          </div>
        </div>
      </footer>
    </div>
  );
}
