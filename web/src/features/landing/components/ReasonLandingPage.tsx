"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import styles from "./ReasonLandingPage.module.css";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
};

export function ReasonLandingPage() {
  const landingRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const cursorDotRef = useRef<HTMLDivElement>(null);
  const cursorRingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const landing = landingRef.current;
    const canvas = canvasRef.current;
    const hud = hudRef.current;
    const cursorDot = cursorDotRef.current;
    const cursorRing = cursorRingRef.current;
    const context = canvas?.getContext("2d");

    if (!landing || !canvas || !hud || !cursorDot || !cursorRing || !context) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let particles: Particle[] = [];
    let animationFrame = 0;

    const mouse = {
      x: width / 2,
      y: height / 2,
      targetX: width / 2,
      targetY: height / 2,
    };
    const ringPosition = { x: mouse.x, y: mouse.y };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const particleCount = Math.min(85, Math.max(38, Math.floor(width / 19)));
      particles = Array.from({ length: particleCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.13,
        vy: (Math.random() - 0.5) * 0.13,
        radius: Math.random() * 0.9 + 0.25,
        alpha: Math.random() * 0.25 + 0.04,
      }));
    };

    const drawGrid = () => {
      context.save();
      context.strokeStyle = "rgba(167,139,250,.028)";
      context.lineWidth = 1;
      const gridSize = 58;
      const offsetX = (mouse.x / width - 0.5) * 10;
      const offsetY = (mouse.y / height - 0.5) * 10;

      for (let x = -gridSize; x < width + gridSize; x += gridSize) {
        context.beginPath();
        context.moveTo(x + offsetX, 0);
        context.lineTo(x + offsetX, height);
        context.stroke();
      }
      for (let y = -gridSize; y < height + gridSize; y += gridSize) {
        context.beginPath();
        context.moveTo(0, y + offsetY);
        context.lineTo(width, y + offsetY);
        context.stroke();
      }
      context.restore();
    };

    const drawParticles = () => {
      for (const particle of particles) {
        if (!reducedMotion) {
          particle.x += particle.vx;
          particle.y += particle.vy;
        }

        if (particle.x < -5) particle.x = width + 5;
        if (particle.x > width + 5) particle.x = -5;
        if (particle.y < -5) particle.y = height + 5;
        if (particle.y > height + 5) particle.y = -5;

        const deltaX = mouse.x - particle.x;
        const deltaY = mouse.y - particle.y;
        const distance = Math.hypot(deltaX, deltaY);

        if (!reducedMotion && distance < 155 && distance > 0) {
          const force = (155 - distance) / 155;
          particle.x -= (deltaX / distance) * force * 0.7;
          particle.y -= (deltaY / distance) * force * 0.7;
        }

        context.beginPath();
        context.fillStyle = `rgba(167,139,250,${particle.alpha})`;
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();

        if (distance < 135) {
          context.beginPath();
          context.strokeStyle = `rgba(167,139,250,${(1 - distance / 135) * 0.115})`;
          context.moveTo(particle.x, particle.y);
          context.lineTo(mouse.x, mouse.y);
          context.stroke();
        }
      }
    };

    const drawCursorAura = () => {
      const gradient = context.createRadialGradient(
        mouse.x,
        mouse.y,
        0,
        mouse.x,
        mouse.y,
        150,
      );
      gradient.addColorStop(0, "rgba(167,139,250,.048)");
      gradient.addColorStop(0.4, "rgba(167,139,250,.017)");
      gradient.addColorStop(1, "rgba(167,139,250,0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(mouse.x, mouse.y, 150, 0, Math.PI * 2);
      context.fill();
    };

    const renderFrame = () => {
      mouse.x += (mouse.targetX - mouse.x) * 0.075;
      mouse.y += (mouse.targetY - mouse.y) * 0.075;
      ringPosition.x += (mouse.targetX - ringPosition.x) * 0.14;
      ringPosition.y += (mouse.targetY - ringPosition.y) * 0.14;

      landing.style.setProperty("--mx", `${mouse.x}px`);
      landing.style.setProperty("--my", `${mouse.y}px`);
      cursorDot.style.transform = `translate(${mouse.targetX - 2}px, ${mouse.targetY - 2}px)`;
      cursorRing.style.transform = `translate(${ringPosition.x - 15}px, ${ringPosition.y - 15}px)`;

      if (window.innerWidth > 960 && !reducedMotion) {
        const rotateX = (mouse.y / height - 0.5) * -7;
        const rotateY = (mouse.x / width - 0.5) * 9;
        hud.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      }

      context.clearRect(0, 0, width, height);
      drawGrid();
      drawParticles();
      drawCursorAura();

      if (!reducedMotion) {
        animationFrame = window.requestAnimationFrame(renderFrame);
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      mouse.targetX = event.clientX;
      mouse.targetY = event.clientY;
      cursorDot.style.opacity = "1";
      cursorRing.style.opacity = "1";
    };
    const handleMouseLeave = () => {
      cursorDot.style.opacity = "0";
      cursorRing.style.opacity = "0";
    };
    const handlePointerOver = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest("[data-cursor-target]")) {
        cursorRing.dataset.active = "true";
      }
    };
    const handlePointerOut = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest("[data-cursor-target]")) {
        delete cursorRing.dataset.active;
      }
    };

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove);
    document.documentElement.addEventListener("mouseleave", handleMouseLeave);
    landing.addEventListener("pointerover", handlePointerOver);
    landing.addEventListener("pointerout", handlePointerOut);
    resize();
    renderFrame();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      document.documentElement.removeEventListener("mouseleave", handleMouseLeave);
      landing.removeEventListener("pointerover", handlePointerOver);
      landing.removeEventListener("pointerout", handlePointerOut);
    };
  }, []);

  return (
    <div ref={landingRef} className={styles.landing}>
      <canvas ref={canvasRef} className={styles.fx} aria-hidden="true" />
      <div className={styles.ambient} aria-hidden="true" />
      <div className={styles.noise} aria-hidden="true" />
      <div ref={cursorDotRef} className={styles.cursorDot} aria-hidden="true" />
      <div ref={cursorRingRef} className={styles.cursorRing} aria-hidden="true" />

      <div className={styles.page}>
        <nav className={styles.nav} aria-label="Primary navigation">
          <div className={styles.navInner}>
            <Link className={styles.brand} href="/" data-cursor-target>
              <span className={styles.brandMark} aria-hidden="true" />
              ReasonAI
            </Link>
            <div className={styles.navLinks}>
              <Link href="/login" data-cursor-target>Login</Link>
              <Link className={styles.navBadge} href="/system-design/canvas" data-cursor-target>
                Canvas <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </nav>

        <main>
          <section className={styles.hero}>
            <div className={styles.copy}>
              <div className={styles.eyebrow}>
                <span className={styles.pulseDot} aria-hidden="true" />
                Reasoning interface online
              </div>
              <h1>Think.<br />Connect.<br /><span className={styles.accent}>Reason.</span></h1>
              <p className={styles.sub}>
                A visual knowledge and learning system built to help you understand
                complex ideas, design real systems, and connect what you learn.
              </p>
              <div className={styles.actions}>
                <Link className={`${styles.button} ${styles.buttonPrimary}`} href="/login" data-cursor-target>
                  Login to begin <span aria-hidden="true">→</span>
                </Link>
                <Link className={`${styles.button} ${styles.buttonSecondary}`} href="/system-design/canvas" data-cursor-target>
                  Open Canvas
                </Link>
              </div>
              <div className={styles.heroMeta} aria-label="Product capabilities">
                <span className={styles.metaPill}>Visual learning</span>
                <span className={styles.metaPill}>Knowledge layer</span>
                <span className={styles.metaPill}>System design</span>
              </div>
            </div>

            <div className={styles.visual} aria-label="Interactive ReasonAI reasoning core">
              <div ref={hudRef} className={styles.hud}>
                <div className={styles.crosshair} />
                <div className={`${styles.ring} ${styles.ringOne}`} />
                <div className={`${styles.ring} ${styles.ringTwo}`} />
                <div className={`${styles.ring} ${styles.ringThree}`} />
                <div className={`${styles.ring} ${styles.ringFour}`} />
                <div className={styles.ticks} />
                <div className={`${styles.orbitDot} ${styles.dotOne}`} />
                <div className={`${styles.orbitDot} ${styles.dotTwo}`} />
                <div className={`${styles.orbitDot} ${styles.dotThree}`} />
                <div className={styles.coreShell}><div className={styles.core} /></div>

                <article className={`${styles.satellite} ${styles.satelliteKnowledge}`} data-cursor-target>
                  <div className={styles.satelliteTop}><span className={styles.satelliteIcon}>◇</span> Knowledge</div>
                  <small>Connect concepts into a living knowledge layer.</small>
                </article>
                <article className={`${styles.satellite} ${styles.satelliteDesign}`} data-cursor-target>
                  <div className={styles.satelliteTop}><span className={styles.satelliteIcon}>⌘</span> System Design</div>
                  <small>Think visually. Design, explain, and collaborate.</small>
                </article>
                <article className={`${styles.satellite} ${styles.satelliteLearn}`} data-cursor-target>
                  <div className={styles.satelliteTop}><span className={styles.satelliteIcon}>↗</span> Learn</div>
                  <small>Turn difficult topics into connected understanding.</small>
                </article>

                <div className={styles.systemReadout}>
                  CORE <b>STABLE</b><br />CONTEXT <b>LINKED</b><br />GRAPH <b>ONLINE</b>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.productSection} id="preview">
            <div className={styles.sectionHead}>
              <p className={styles.sectionKicker}>One intelligence layer</p>
              <h2>Learn it. Map it. Design it.</h2>
              <p className={styles.sectionDescription}>
                Preview the connected workspace. Login is required when you are ready to enter the canvas.
              </p>
            </div>
            <div className={styles.productGrid}>
              <article className={styles.productCard} data-cursor-target>
                <div className={styles.productIcon}>01</div>
                <h3>Learn</h3>
                <p>Understand difficult technical concepts through structured, connected explanations instead of disconnected notes.</p>
                <span className={styles.cardLink}>Preview</span>
              </article>
              <article className={styles.productCard} data-cursor-target>
                <div className={styles.productIcon}>02</div>
                <h3>Knowledge</h3>
                <p>Build a reusable knowledge layer that connects concepts, diagrams, references, and what you have already learned.</p>
                <span className={styles.cardLink}>Preview</span>
              </article>
              <article className={styles.productCard} data-cursor-target>
                <div className={styles.productIcon}>03</div>
                <h3>System Design</h3>
                <p>Design architectures on an interactive canvas, reason through trade-offs, and collaborate visually in real time.</p>
                <Link className={styles.cardLink} href="/system-design/canvas">
                  Open Canvas <span aria-hidden="true">→</span>
                </Link>
              </article>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
