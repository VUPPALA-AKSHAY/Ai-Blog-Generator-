"use client";

import { ChevronDown, Copy, Loader2, Send, Paperclip } from "lucide-react";
import type { FormEvent, KeyboardEvent, PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useVelocity
} from "motion/react";
import { TegakiRenderer } from "tegaki/react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import caveat from "tegaki/fonts/caveat";

gsap.registerPlugin(ScrollToPlugin, ScrollTrigger);

type GeneratedCard = {
  id: string;
  heading: string;
  content: string;
};

type StreamStartEvent = {
  type: "start";
  cards: GeneratedCard[];
};

type StreamChunkEvent = {
  type: "chunk";
  id: string;
  contentChunk: string;
};

type StreamDoneEvent = {
  type: "done";
};

type StreamErrorEvent = {
  type: "error";
  error: string;
};

type StreamEvent = StreamStartEvent | StreamChunkEvent | StreamDoneEvent | StreamErrorEvent;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";

const initialPrompt = "blog ideas for fitness app";
const handwritingPrompts = [
  "Hello, what's on your mind?",
  "Write a blog idea",
  "Create product copy",
  "Shape your next caption"
];
const handwritingPromptDuration = 3200;

function WritingCursor({ content }: { content: string }) {
  const targetRef = useRef<HTMLSpanElement | null>(null);
  const previousPositionRef = useRef({ x: 0, y: 0 });
  const resetMotionRef = useRef<number | null>(null);
  const [movement, setMovement] = useState<"writing" | "returning">("writing");
  const [isVisible, setIsVisible] = useState(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const smoothX = useSpring(x, { damping: 30, stiffness: 245, mass: 0.9 });
  const smoothY = useSpring(y, { damping: 30, stiffness: 245, mass: 0.9 });
  const velocityX = useVelocity(smoothX);
  const velocityY = useVelocity(smoothY);

  const rotate = useSpring(
    useTransform([velocityX, velocityY], ([vx, vy]) => {
      const tilt = ((vx as number) / 1000) * 30 + ((vy as number) / 1000) * 16;
      return Math.max(-45, Math.min(45, tilt));
    }),
    { damping: 20, stiffness: 155, mass: 0.95 }
  );

  const scaleX = useTransform(velocityX, [-1000, 0, 1000], [0.86, 1, 1.18]);
  const scaleY = useTransform(velocityY, [-1000, 0, 1000], [1.14, 1, 0.9]);

  useEffect(() => {
    const target = targetRef.current;
    const card = target?.closest(".output-card");

    if (!target || !card) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const targetRect = target.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const nextPosition = {
        x: targetRect.left - cardRect.left - 1,
        y: targetRect.top - cardRect.top + targetRect.height - 14
      };
      const previousPosition = previousPositionRef.current;
      const movedToNextLine =
        nextPosition.y - previousPosition.y > 7 || nextPosition.x - previousPosition.x < -28;

      x.set(nextPosition.x);
      y.set(nextPosition.y);
      setIsVisible(content.length > 0);

      if (movedToNextLine && content.length > 0) {
        setMovement("returning");

        if (resetMotionRef.current) {
          window.clearTimeout(resetMotionRef.current);
        }

        resetMotionRef.current = window.setTimeout(() => {
          setMovement("writing");
        }, 260);
      }

      previousPositionRef.current = nextPosition;
    });

    return () => {
      window.cancelAnimationFrame(frame);

      if (resetMotionRef.current) {
        window.clearTimeout(resetMotionRef.current);
      }
    };
  }, [content, x, y]);

  return (
    <>
      <span ref={targetRef} aria-hidden="true" className="writing-cursor-target" />
      <motion.span
        aria-hidden="true"
        className={`writing-cursor-motion ${movement === "returning" ? "is-returning" : ""}`}
        style={{
          left: smoothX,
          top: smoothY,
          opacity: isVisible ? 1 : 0,
          rotate,
          scaleX,
          scaleY
        }}
      >
        <svg viewBox="0 0 40 40" className="writing-cursor-svg">
          <path d="M1.8 4.4 7 36.2c.3 1.8 2.6 2.3 3.6.8l3.9-5.7c1.7-2.5 4.5-4.1 7.5-4.3l6.9-.5c1.8-.1 2.5-2.4 1.1-3.5L5 2.5c-1.4-1.1-3.5 0-3.3 1.9Z" />
        </svg>
      </motion.span>
    </>
  );
}

export default function Home() {
  const shellRef = useRef<HTMLElement | null>(null);
  const cursorTracker = useRef({ x: 50, y: 50 });
  const hoverWeight = useRef({ value: 0 });
  const color1 = useRef({ x: 16, y: 48 });
  const color2 = useRef({ x: 50, y: 46 });
  const color3 = useRef({ x: 78, y: 50 });
  const color4 = useRef({ x: 98, y: 32 });
  const color5 = useRef({ x: 30, y: 70 });
  const flowVal = useRef({ x: 0, y: 0, force: 0 });
  const idleTimeoutRef = useRef<number | null>(null);

  const [prompt, setPrompt] = useState("");
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [handwritingIndex, setHandwritingIndex] = useState(0);
  const [streamingCardIds, setStreamingCardIds] = useState<string[]>([]);

  const handwritingPrompt = handwritingPrompts[handwritingIndex] ?? handwritingPrompts[0];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setHandwritingIndex((current) => (current + 1) % handwritingPrompts.length);
    }, handwritingPromptDuration);

    return () => window.clearInterval(interval);
  }, []);

  const { contextSafe } = useGSAP({ scope: shellRef });

  useGSAP(() => {
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.from(".topbar", { y: -30, opacity: 0, duration: 0.8 })
      .from(".handwriting-hero", { opacity: 0, scale: 0.9, duration: 0.8 }, "-=0.4")
      .from(".hero-copy", { y: 20, opacity: 0, duration: 0.6 }, "-=0.5")
      .from(".prompt-form", { y: 20, opacity: 0, duration: 0.6 }, "-=0.4");

    gsap.from(".footer-brand, .footer-links a, .footer p", {
      scrollTrigger: {
        trigger: ".footer",
        start: "top bottom-=20",
        toggleActions: "play none none none"
      },
      opacity: 0,
      y: 20,
      duration: 0.8,
      stagger: 0.1,
      ease: "power3.out"
    });

    return () => {
      gsap.killTweensOf([cursorTracker.current, hoverWeight.current, flowVal.current]);
      if (idleTimeoutRef.current) window.clearTimeout(idleTimeoutRef.current);
    };
  }, { scope: shellRef });

  useGSAP(() => {
    const updateColors = () => {
      const shell = shellRef.current;
      if (!shell) return;

      const t = gsap.ticker.time;

      const flow1X = 32 + Math.sin(t * 2.64) * 24 + Math.cos(t * 1.08) * 10;
      const flow1Y = 48 + Math.cos(t * 1.92) * 24 + Math.sin(t * 1.32) * 10;

      const flow2X = 50 + Math.sin(t * 2.28 + 1.5) * 28 + Math.cos(t * 1.20 + 0.5) * 12;
      const flow2Y = 46 + Math.cos(t * 2.88 + 0.8) * 26 + Math.sin(t * 0.84 + 2.0) * 12;

      const flow3X = 68 + Math.sin(t * 3.12 + 3.0) * 24 + Math.cos(t * 1.44 + 1.2) * 10;
      const flow3Y = 52 + Math.cos(t * 2.40 + 2.2) * 24 + Math.sin(t * 0.96 + 0.6) * 10;

      const flow4X = 86 + Math.sin(t * 2.04 + 4.5) * 28 + Math.cos(t * 1.68 + 2.5) * 14;
      const flow4Y = 36 + Math.cos(t * 3.36 + 3.0) * 22 + Math.sin(t * 0.72 + 1.5) * 12;

      const flow5X = 26 + Math.sin(t * 2.40 + 5.5) * 22 + Math.cos(t * 0.96 + 3.5) * 10;
      const flow5Y = 66 + Math.cos(t * 2.16 + 4.0) * 20 + Math.sin(t * 1.44 + 1.0) * 10;

      const w = hoverWeight.current.value;
      const cx = cursorTracker.current.x;
      const cy = cursorTracker.current.y;

      const targetX1 = flow1X + w * ((cx - 30) - flow1X);
      const targetY1 = flow1Y + w * ((cy + 6) - flow1Y);

      const targetX2 = flow2X + w * (cx - flow2X);
      const targetY2 = flow2Y + w * (cy - flow2Y);

      const targetX3 = flow3X + w * ((cx + 24) - flow3X);
      const targetY3 = flow3Y + w * ((cy + 8) - flow3Y);

      const targetX4 = flow4X + w * ((cx + 38) - flow4X);
      const targetY4 = flow4Y + w * ((cy - 12) - flow4Y);

      const targetX5 = flow5X + w * ((cx - 15) - flow5X);
      const targetY5 = flow5Y + w * ((cy + 20) - flow5Y);

      color1.current.x += (targetX1 - color1.current.x) * 0.08;
      color1.current.y += (targetY1 - color1.current.y) * 0.08;

      color2.current.x += (targetX2 - color2.current.x) * 0.12;
      color2.current.y += (targetY2 - color2.current.y) * 0.12;

      color3.current.x += (targetX3 - color3.current.x) * 0.07;
      color3.current.y += (targetY3 - color3.current.y) * 0.07;

      color4.current.x += (targetX4 - color4.current.x) * 0.10;
      color4.current.y += (targetY4 - color4.current.y) * 0.10;

      color5.current.x += (targetX5 - color5.current.x) * 0.09;
      color5.current.y += (targetY5 - color5.current.y) * 0.09;

      shell.style.setProperty("--color1-x", `${color1.current.x.toFixed(2)}%`);
      shell.style.setProperty("--color1-y", `${color1.current.y.toFixed(2)}%`);

      shell.style.setProperty("--color2-x", `${color2.current.x.toFixed(2)}%`);
      shell.style.setProperty("--color2-y", `${color2.current.y.toFixed(2)}%`);

      shell.style.setProperty("--color3-x", `${color3.current.x.toFixed(2)}%`);
      shell.style.setProperty("--color3-y", `${color3.current.y.toFixed(2)}%`);

      shell.style.setProperty("--color4-x", `${color4.current.x.toFixed(2)}%`);
      shell.style.setProperty("--color4-y", `${color4.current.y.toFixed(2)}%`);

      shell.style.setProperty("--color5-x", `${color5.current.x.toFixed(2)}%`);
      shell.style.setProperty("--color5-y", `${color5.current.y.toFixed(2)}%`);

      shell.style.setProperty("--cursor-force", `${flowVal.current.force.toFixed(2)}`);
      shell.style.setProperty("--flow-x", `${flowVal.current.x.toFixed(2)}px`);
      shell.style.setProperty("--flow-y", `${flowVal.current.y.toFixed(2)}px`);
    };

    gsap.ticker.add(updateColors);
    return () => {
      gsap.ticker.remove(updateColors);
    };
  }, { scope: shellRef });

  useGSAP(() => {
    if (cards.length > 0) {
      gsap.fromTo(
        ".output-card",
        {
          opacity: 0,
          y: 40,
          scale: 0.95,
          transformPerspective: 1000,
          rotationX: 10
        },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          rotationX: 0,
          duration: 0.6,
          stagger: 0.1,
          ease: "power2.out",
          clearProps: "all"
        }
      );
    }
  }, { dependencies: [cards.length], scope: shellRef });

  const onHoverButton = contextSafe((event: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    gsap.to(event.currentTarget, {
      scale: 1.05,
      y: -2,
      boxShadow: "0 8px 24px rgba(124, 77, 255, 0.25)",
      duration: 0.2,
      ease: "power1.out"
    });
  });

  const onLeaveButton = contextSafe((event: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    gsap.to(event.currentTarget, {
      scale: 1,
      y: 0,
      boxShadow: "none",
      duration: 0.2,
      ease: "power1.out"
    });
  });

  const onPressButton = contextSafe((event: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    gsap.to(event.currentTarget, {
      scale: 0.95,
      y: 0,
      duration: 0.1,
      yoyo: true,
      repeat: 1,
      ease: "power1.inOut"
    });
  });

  async function generateContent(input: string) {
    const trimmed = input.trim();

    if (!trimmed) {
      return;
    }

    setIsGenerating(true);
    setError("");
    setStreamingCardIds([]);

    if (cards.length > 0) {
      await new Promise<void>((resolve) => {
        gsap.to(".output-card", {
          opacity: 0,
          y: 20,
          scale: 0.95,
          duration: 0.3,
          stagger: 0.05,
          ease: "power2.in",
          onComplete: () => {
            setCards([]);
            resolve();
          }
        });
      });
    }

    try {
      const response = await fetch(`${API_URL}/api/generate/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt: trimmed })
      });

      if (!response.ok) {
        const errData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || "Generation failed");
      }

      if (!response.body) {
        throw new Error("Streaming is unavailable right now.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) {
            continue;
          }

          const event = JSON.parse(line) as StreamEvent;

          if (event.type === "start") {
            setCards(event.cards);
            setStreamingCardIds(event.cards.map((card) => card.id));
            continue;
          }

          if (event.type === "chunk") {
            setCards((current) =>
              current.map((card) =>
                card.id === event.id
                  ? { ...card, content: `${card.content}${event.contentChunk}` }
                  : card
              )
            );
            continue;
          }

          if (event.type === "done") {
            setStreamingCardIds([]);
            continue;
          }

          if (event.type === "error") {
            throw new Error(event.error || "Failed to generate content.");
          }
        }
      }
    } catch (err: any) {
      setStreamingCardIds([]);
      if (err instanceof Error && err.message !== "Failed to fetch") {
        setError(err.message);
      } else {
        setError("The generator is offline. Start the Express server and try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void generateContent(prompt);
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function handleCopy(card: GeneratedCard) {
    await navigator.clipboard.writeText(`${card.heading}\n\n${card.content}`);
    setCopiedId(card.id);
    window.setTimeout(() => setCopiedId(null), 1300);
  }

  const handlePointerMove = contextSafe((event: PointerEvent<HTMLElement>) => {
    const targetX = (event.clientX / window.innerWidth) * 100;
    const targetY = (event.clientY / window.innerHeight) * 100;
    const movementX = Math.max(-1, Math.min(1, event.movementX / 34));
    const movementY = Math.max(-1, Math.min(1, event.movementY / 34));

    if (idleTimeoutRef.current) {
      window.clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }

    gsap.killTweensOf([cursorTracker.current, hoverWeight.current, flowVal.current]);

    gsap.to(cursorTracker.current, {
      x: targetX,
      y: targetY,
      duration: 0.4,
      ease: "power2.out"
    });

    gsap.to(hoverWeight.current, {
      value: 0.68,
      duration: 0.5,
      ease: "power1.out"
    });

    gsap.to(flowVal.current, {
      force: 1.8,
      x: movementX * 140,
      y: movementY * 140,
      duration: 0.25,
      ease: "power1.out"
    });

    idleTimeoutRef.current = window.setTimeout(() => {
      gsap.to(hoverWeight.current, {
        value: 0,
        duration: 3.0,
        ease: "power2.inOut"
      });
      gsap.to(flowVal.current, {
        force: 0,
        x: 0,
        y: 0,
        duration: 3.0,
        ease: "power2.inOut"
      });
    }, 2500);
  });

  const handlePointerLeave = contextSafe(() => {
    if (idleTimeoutRef.current) {
      window.clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
    gsap.killTweensOf([hoverWeight.current, flowVal.current]);
    gsap.to(hoverWeight.current, {
      value: 0,
      duration: 1.5,
      ease: "power2.out"
    });
    gsap.to(flowVal.current, {
      force: 0,
      x: 0,
      y: 0,
      duration: 1.5,
      ease: "power2.out"
    });
  });

  return (
    <main ref={shellRef} className="app-shell" onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}>
      <header className="topbar">
        <a 
          className="brand" 
          href="#" 
          aria-label="Shuroq home"
        >
          Shuroq
        </a>
      </header>

      <section className="generator-area">
        <div className="handwriting-hero" aria-label={handwritingPrompt}>
          <TegakiRenderer
            key={handwritingPrompt}
            font={caveat}
            time={{ mode: "uncontrolled", speed: 4.8, loop: false }}
            quality={{ pixelRatio: 1.25, smoothing: true }}
            style={{ fontSize: "clamp(28px, 4vw, 52px)", lineHeight: 1.02 }}
          >
            {handwritingPrompt}
          </TegakiRenderer>
        </div>
        <p className="hero-copy">
          Turn rough ideas into six polished directions for blogs, captions, SEO titles, product copy, and ads.
        </p>

        <form className="prompt-form" onSubmit={handleSubmit}>
          <input
            aria-label="Content request"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handlePromptKeyDown}
            placeholder="Type your blog idea, product description, or content topic..."
          />
          <div className="prompt-actions">
            <div className="prompt-actions-left">
              <button 
                type="button" 
                className="action-icon-button" 
                aria-label="Attach file"
              >
                <Paperclip size={16} />
              </button>
              <button 
                type="button" 
                className="model-selector"
              >
                <span>glm-5</span>
                <ChevronDown size={14} />
              </button>
            </div>
            <button 
              className="send-button" 
              type="submit" 
              aria-label="Generate content" 
              disabled={isGenerating}
              onMouseEnter={onHoverButton}
              onMouseLeave={onLeaveButton}
              onMouseDown={onPressButton}
            >
              {isGenerating ? <Loader2 className="spin" size={18} /> : <Send size={16} />}
            </button>
          </div>
        </form>

        {error ? <p className="error-message">{error}</p> : null}

        <section id="outputs" className={cards.length ? "output-grid active" : "output-grid"} aria-live="polite">
          {cards.map((card) => {
            const isStreaming = streamingCardIds.includes(card.id);

            return (
              <article 
                className={isStreaming ? "output-card is-streaming" : "output-card"} 
                key={card.id}
              >
                <span className="card-side-slider" aria-hidden="true" />
                <h2>{card.heading}</h2>
                <div className="card-content-scroll">
                  <p className={isStreaming ? "card-copy is-writing" : "card-copy"}>
                    {card.content}
                    {isStreaming ? <WritingCursor content={card.content} /> : null}
                  </p>
                </div>
                <button className="copy-button" type="button" onClick={() => void handleCopy(card)}>
                  <span>{copiedId === card.id ? "COPIED" : "COPY"}</span>
                  <Copy size={15} />
                </button>
              </article>
            );
          })}
        </section>
      </section>
    </main>
  );
}
