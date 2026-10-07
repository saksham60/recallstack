"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  CircleDot,
  Code2,
  GitBranch,
  Layers,
  MessageSquare,
  Minus,
  MousePointer2,
  Network,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import {
  siCloudflare,
  siFlutter,
  siGo,
  siLanggraph,
  siNextdotjs,
  siNvidia,
  siSupabase,
} from "simple-icons";
import styles from "./ReasonLandingPage.module.css";

const judgmentRows = [
  ["Ask questions", true, true],
  ["Understand context", true, true],
  ["Web research", true, true],
  ["Visual workspace", false, true],
  ["Manipulate the canvas", false, true],
  ["Review AI actions", false, true],
  ["Realtime collaboration", false, true],
  ["Learning memory", "Limited", true],
  ["Technical discovery feed", false, true],
] as const;

type SimpleBrandIcon = {
  path: string;
  title: string;
};

function BrandIcon({
  icon,
  color,
}: {
  icon: SimpleBrandIcon;
  color: string;
}) {
  return (
    <svg
      className={styles.brandLogo}
      viewBox="0 0 24 24"
      role="img"
      aria-label={icon.title}
    >
      <path d={icon.path} fill={color} />
    </svg>
  );
}

function TavilyLogo() {
  return (
    <svg
      className={styles.brandLogo}
      viewBox="0 0 160 160"
      role="img"
      aria-label="Tavily"
    >
      <path d="M65.59265 18.682923 80.673 42.556618c2.422 3.83405-.333 8.83305-4.868 8.83305h-6.1655v35.75275h-8.9149V16c1.8692 0 3.7384.894313 4.86805 2.682923Z" fill="#8FBCFA" />
      <path d="M40.7741 42.556618 55.8549 18.682923C56.98455 16.894313 58.85375 16 60.72295 16v71.142918c-3.1936-.149-6.2852.775-8.91495 2.6325v-38.38575h-6.16555c-4.535 0-7.2901-4.999-4.86835-8.83305Z" fill="#468BFF" />
      <path d="M108.0015 110.725918H70.67c2.154-2.4115 3.4305-5.482 3.568-8.915h69.153c0 1.869-.8945 3.7385-2.683 4.868l-23.8735 15.0805c-3.834 2.422-8.833-.333-8.833-4.868v-6.1655Z" fill="#FDBB11" />
      <path d="m116.834 81.862418 23.8735 15.0805c1.789 1.1295 2.683 2.999 2.683 4.868H74.2355c.1245-3.2015-.869-6.3585-2.757-8.915h36.5225v-6.1655c0-4.535 4.999-7.29 8.833-4.868Z" fill="#F6D785" />
      <path d="m40.47045 120.901918-21.780995 21.781c1.321675 1.322 3.27572 2.011 5.339345 1.5455l27.5448-6.218c4.4236-.9985 6.0103-6.4825 2.80365-9.688l-4.35975-4.36 16.3783-16.4315c3.4897-3.49 3.3352-9.078-.0579-12.471l-25.86745 25.842Z" fill="#FF9A9D" />
      <path d="m37.41105 111.357418 16.43385-16.3725c3.4898-3.49 9.10165-3.3175 12.4946.075l-25.8677 25.8445-21.781145 21.781c-1.321678-1.3215-2.010986-3.276-1.545155-5.3395l6.21775-27.5445c.99855-4.424 6.4815-6.0105 9.68815-2.804l4.35965 4.36Z" fill="#FE363B" />
    </svg>
  );
}

export function ReasonLandingPage() {
  return (
    <div className={styles.landing}>
      <div className={styles.ambient} aria-hidden="true" />
      <div className={styles.gridGlow} aria-hidden="true" />

      <header className={styles.header}>
        <div className={styles.navShell}>
          <Link href="/" className={styles.brand} aria-label="ReasonAI home">
            <span className={styles.brandMark} aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </span>
            <span>ReasonAI</span>
          </Link>

          <nav className={styles.navLinks} aria-label="Primary navigation">
            <a href="#product">Product</a>
            <a href="#system-design">System Design</a>
            <a href="#learn">Learn</a>
            <a href="#knowledge">Knowledge</a>
          </nav>

          <div className={styles.navActions}>
            <Link href="/login" className={styles.loginLink}>Log in</Link>
            <Link href="/login" className={styles.primaryButton}>
              Try ReasonAI <ArrowRight size={15} strokeWidth={1.9} />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.hero} id="product">
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>
              <Sparkles size={13} />
              AI-native reasoning workspace for engineers
            </div>
            <h1>Build Better <span>Judgment.</span></h1>
            <p className={styles.heroLead}>
              Design systems, learn complex ideas, research decisions, and keep
              the context that makes your next answer better.
            </p>
            <div className={styles.heroActions}>
              <Link href="/login" className={styles.primaryButtonLarge}>
                Try ReasonAI <ArrowRight size={17} />
              </Link>
              <a href="#system-design" className={styles.secondaryButtonLarge}>
                Explore the workspace
              </a>
            </div>
            <div className={styles.capabilityStrip}>
              <span><Network size={15} /> Visual reasoning</span>
              <span><MousePointer2 size={15} /> AI-native canvas</span>
              <span><Users size={15} /> Realtime collaboration</span>
              <span><Brain size={15} /> Persistent memory</span>
            </div>
          </div>

          <div className={styles.heroVisual} aria-label="ReasonAI system design workspace preview">
            <div className={styles.heroHalo} aria-hidden="true" />
            <div className={styles.workspaceStack} aria-hidden="true">
              <div className={styles.stackTwo} />
              <div className={styles.stackOne} />
            </div>
            <div className={styles.workspaceWindow}>
              <div className={styles.workspaceTopbar}>
                <div className={styles.workspaceBrand}><span className={styles.miniMark}>✦</span>ReasonAI</div>
                <div className={styles.workspacePrompt}>
                  Design a URL shortener for 10M users and show me where it breaks.
                  <span className={styles.promptButton}><ArrowRight size={13} /></span>
                </div>
              </div>

              <div className={styles.workspaceBody}>
                <aside className={styles.workspaceSidebar}>
                  <div className={styles.sideItem}><CircleDot size={13} /> Feed</div>
                  <div className={styles.sideItem}><Code2 size={13} /> DSA</div>
                  <div className={[styles.sideItem, styles.sideItemActive].join(" ")}><Network size={13} /> Canvas</div>
                  <div className={styles.sideItem}><Brain size={13} /> Memory</div>
                  <div className={styles.sideSpacer} />
                  <div className={styles.sideItem}><Layers size={13} /> Projects</div>
                  <div className={styles.sideItem}><Sparkles size={13} /> Saved</div>
                </aside>

                <div className={styles.canvasPreview}>
                  <div className={styles.canvasToolbar}>
                    <span>System Design / URL Shortener</span>
                    <div><span>Share</span><span>Live</span><span className={styles.avatar}>S</span><span className={styles.avatar}>A</span></div>
                  </div>

                  <div className={styles.architectureMap}>
                    <div className={[styles.node, styles.nodeClient].join(" ")}>Client</div>
                    <span className={[styles.line, styles.lineA].join(" ")} />
                    <div className={[styles.node, styles.nodeGateway].join(" ")}>API Gateway</div>
                    <span className={[styles.line, styles.lineB].join(" ")} />
                    <div className={[styles.node, styles.nodeApi].join(" ")}>Application API</div>
                    <span className={[styles.line, styles.lineC].join(" ")} />
                    <span className={[styles.line, styles.lineD].join(" ")} />
                    <div className={[styles.node, styles.nodeRedis].join(" ")}>Redis<br /><small>Cache</small></div>
                    <div className={[styles.node, styles.nodeDb].join(" ")}>PostgreSQL<br /><small>Primary DB</small></div>
                    <span className={[styles.line, styles.lineE].join(" ")} />
                    <div className={[styles.node, styles.nodeQueue].join(" ")}>Message Queue<br /><small>Async tasks</small></div>
                    <span className={[styles.line, styles.lineF].join(" ")} />
                    <div className={[styles.node, styles.nodeStorage].join(" ")}>Object Storage<br /><small>Analytics</small></div>
                    <div className={styles.mapNote}>Rate limiting<br />Auth / Abuse prevention</div>
                  </div>

                  <div className={styles.aiProposal}>
                    <div className={styles.proposalTitle}><span>✦</span> ReasonAI</div>
                    <strong>Add caching before database reads?</strong>
                    <ul>
                      <li><Check size={12} /> Add Redis cache for short URL lookups</li>
                      <li><Check size={12} /> Set TTL and invalidation strategy</li>
                      <li><Check size={12} /> Keep database as source of truth</li>
                    </ul>
                    <div className={styles.proposalActions}>
                      <button type="button">Discard</button>
                      <button type="button">Apply 3 changes <ArrowRight size={12} /></button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.judgmentSection}>
          <div className={styles.sectionCenter}>
            <div className={styles.sectionEyebrow}>A new way to work with AI</div>
            <h2>AI gives answers. ReasonAI builds <span>judgment.</span></h2>
            <p>
              Go beyond one-off answers. ReasonAI connects reasoning to an
              interactive workspace where you can explore, question, visualize,
              and build real understanding.
            </p>
          </div>

          <div className={styles.reasoningGrid}>
            <article className={styles.reasoningCard}>
              <div className={styles.reasoningHeading}>
                <span className={styles.stepIcon}><MessageSquare size={18} /></span>
                <div><small>01</small><h3>Ask</h3></div>
              </div>
              <p>Talk naturally about what you are building or learning.</p>
              <div className={styles.askDemo}><span>How would you design a chat system for 1M users?</span><ArrowRight size={14} /></div>
            </article>

            <article className={styles.reasoningCard}>
              <div className={styles.reasoningHeading}>
                <span className={styles.stepIcon}><Brain size={18} /></span>
                <div><small>02</small><h3>Reason</h3></div>
              </div>
              <p>ReasonAI researches, analyzes context, and proposes the next move.</p>
              <div className={styles.reasonDemo}>
                <span><CircleDot size={12} /> Analyzing requirements...</span>
                <span><Search size={12} /> Researching trade-offs...</span>
                <span><Workflow size={12} /> Preparing visual design...</span>
              </div>
            </article>

            <article className={styles.reasoningCard}>
              <div className={styles.reasoningHeading}>
                <span className={styles.stepIcon}><MousePointer2 size={18} /></span>
                <div><small>03</small><h3>Act</h3></div>
              </div>
              <p>Turn reasoning into diagrams, learning material, and workspace changes.</p>
              <div className={styles.actDemo}>
                <div>API</div><div>Worker</div><div>Queue</div><div>DB</div>
                <span className={styles.actLineOne} /><span className={styles.actLineTwo} /><span className={styles.actLineThree} />
              </div>
            </article>
          </div>
        </section>

        <section className={styles.systemSection} id="system-design">
          <div className={styles.systemCopy}>
            <div className={styles.sectionEyebrow}>System Design</div>
            <h2>Architecture that thinks with you.</h2>
            <p>Start with a blank canvas, an existing architecture, or simply describe what you are building.</p>
            <Link href="/system-design/canvas" className={styles.primaryButtonLarge}>
              Open System Design <ArrowRight size={17} />
            </Link>
          </div>

          <div className={styles.systemCanvas}>
            <div className={styles.systemCanvasGrid} />
            <div className={[styles.systemNode, styles.sysLoad].join(" ")}>Load<br />Balancer</div>
            <div className={[styles.systemNode, styles.sysAuth].join(" ")}>Auth<br />Service</div>
            <div className={[styles.systemNode, styles.sysChat].join(" ")}>Chat<br />Service</div>
            <div className={[styles.systemNode, styles.sysUser].join(" ")}>User<br />Service</div>
            <div className={[styles.systemNode, styles.sysNotif].join(" ")}>Notification<br />Service</div>
            <div className={[styles.systemNode, styles.sysPg].join(" ")}>PostgreSQL</div>
            <div className={[styles.systemNode, styles.sysRedis].join(" ")}>Redis</div>
            <div className={[styles.systemNode, styles.sysObject].join(" ")}>Object Storage</div>
            <div className={styles.canvasProposal}>
              <span>✦ ReasonAI</span>
              <p>I have added a message queue to handle spikes in traffic.</p>
              <small><Check size={11} /> Handles burst traffic</small>
              <small><Check size={11} /> Decouples services</small>
              <small><Check size={11} /> Improves reliability</small>
              <button type="button">Apply to canvas</button>
            </div>
          </div>

          <div className={styles.systemBenefits}>
            <div><span><Sparkles size={18} /></span><p><strong>Design with AI</strong>Ask ReasonAI to add components, identify bottlenecks, or redesign parts of an architecture.</p></div>
            <div><span><Search size={18} /></span><p><strong>Research decisions</strong>Reason about databases, queues, caching, availability, and trade-offs using external evidence.</p></div>
            <div><span><ShieldCheck size={18} /></span><p><strong>Stay in control</strong>AI-generated changes are reviewable proposals — Apply or Discard.</p></div>
            <div><span><Users size={18} /></span><p><strong>Build together</strong>Multiple engineers can work inside the same realtime room.</p></div>
          </div>
        </section>

        <section className={styles.worldSection} id="learn">
          <div className={styles.worldHeader}>
            <div className={styles.sectionEyebrow}>Your engineering world, connected</div>
            <h2>Learn. Explore. Remember. Everywhere.</h2>
          </div>

          <div className={styles.worldGrid}>
            <article className={[styles.worldCard, styles.feedCard].join(" ")} id="knowledge">
              <div className={styles.cardKicker}><BookOpen size={16} /> Knowledge Feed</div>
              <h3>Stop scrolling.<br />Start learning.</h3>
              <p>A personalized stream of engineering and AI stories, enriched into useful technical briefs.</p>
              <div className={styles.storyPreview}>
                <div className={styles.storyImage}>AI</div>
                <div><strong>Agent memory is becoming infrastructure</strong><small>AI Systems · 6 min</small></div>
              </div>
              <Link href="/login">Ask ReasonAI <ArrowRight size={13} /></Link>
            </article>

            <article className={styles.worldCard}>
              <div className={styles.cardKicker}><Code2 size={16} /> DSA</div>
              <h3>Don&apos;t memorize the algorithm.<br />Understand it.</h3>
              <p>Interactive explanations, visualizations, and guided practice.</p>
              <div className={styles.treePreview} aria-hidden="true">
                <span className={styles.treeOne}>1</span><span className={styles.treeTwo}>2</span>
                <span className={styles.treeThree}>3</span><span className={styles.treeFour}>4</span><span className={styles.treeFive}>5</span>
              </div>
              <div className={styles.miniQuestion}>Why do we need a recursion stack in addition to visited? <ArrowRight size={13} /></div>
            </article>

            <article className={styles.worldCard}>
              <div className={styles.cardKicker}><Brain size={16} /> Memory</div>
              <h3>ReasonAI remembers<br />the useful parts.</h3>
              <p>Keep useful learning and workspace context across sessions.</p>
              <div className={styles.memoryFlow}>
                <span><CircleDot size={13} /> Past session</span><i />
                <span><BookOpen size={13} /> Concept learned</span><i />
                <span><Brain size={13} /> User preference</span><i />
                <span><Workflow size={13} /> Current context</span><i />
                <span><Sparkles size={13} /> Better next answer</span>
              </div>
            </article>

            <article className={styles.worldCard}>
              <div className={styles.cardKicker}><Smartphone size={16} /> Mobile</div>
              <h3>Keep learning<br />away from the desk.</h3>
              <p>Access your feed and learning flows on the go.</p>
              <div className={styles.phonePreview}>
                <div className={styles.phoneNotch} />
                <div className={styles.phoneTop}>✦ ReasonAI <span>•••</span></div>
                <div className={styles.phoneTabs}><b>For You</b><span>System Design</span><span>AI Systems</span></div>
                <div className={styles.phoneStory}><em>AI</em><span>Distributed systems are getting simpler<small>6 min read</small></span></div>
                <div className={styles.phoneStory}><em>DB</em><span>Consistency models in modern databases<small>8 min read</small></span></div>
              </div>
            </article>
          </div>
        </section>

        <section className={styles.compareSection}>
          <div className={styles.compareCopy}>
            <div className={styles.sectionEyebrow}>Not another AI chat wrapper</div>
            <h2>A complete reasoning workspace.</h2>
            <p>Purpose-built for engineers who want to understand, decide, and build.</p>
          </div>

          <div className={styles.compareTable} role="table" aria-label="ReasonAI capability comparison">
            <div className={[styles.compareRow, styles.compareHead].join(" ")} role="row">
              <span role="columnheader">Capability</span><span role="columnheader">General AI tools</span><span role="columnheader">ReasonAI</span>
            </div>
            {judgmentRows.map(([label, general, reason]) => (
              <div className={styles.compareRow} role="row" key={label}>
                <span role="cell">{label}</span>
                <span role="cell">{general === true ? <Check size={15} /> : general === false ? <Minus size={15} /> : general}</span>
                <span role="cell" className={styles.reasonCheck}>{reason ? <Check size={15} /> : <Minus size={15} />}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.repoSection}>
          <div className={styles.repoHeader}>
            <div><div className={styles.sectionEyebrow}>Coming next</div><h2>From codebase to architecture.</h2></div>
            <span className={styles.devBadge}>In development</span>
          </div>
          <p className={styles.repoIntro}>Turn an unfamiliar repository into an architecture you can explore, question, and evolve.</p>

          <div className={styles.repoFlow}>
            <div className={styles.repoBlock}><GitBranch size={24} /><div><strong>github.com/company/platform</strong><small>Connect your repository</small></div></div>
            <ArrowRight className={styles.repoArrow} />
            <div className={styles.repoBlock}><Sparkles size={24} /><div><strong>ReasonAI analyzes</strong><small>Services, APIs, databases, queues, dependencies, infrastructure</small></div></div>
            <ArrowRight className={styles.repoArrow} />
            <div className={[styles.repoBlock, styles.repoCanvasBlock].join(" ")}><Network size={24} /><div><strong>Editable architecture canvas</strong><small>Explore, question, and evolve the system visually</small></div></div>
          </div>
        </section>

        <section className={styles.techSection}>
          <div className={styles.techCopy}>
            <div className={styles.sectionEyebrow}>Built as a real system, not a demo</div>
            <h2>Powered by modern technology.</h2>
            <p>Model routing, persistent checkpoints, tool calling, realtime collaboration, and source-backed research work behind the interface.</p>
          </div>
          <div className={styles.techGrid} aria-label="ReasonAI technology stack">
            <span className={styles.techBrand}>
              <BrandIcon icon={siNvidia} color="#76B900" />
              <strong>NVIDIA Nemotron</strong>
            </span>
            <span className={styles.techBrand}>
              <BrandIcon icon={siLanggraph} color="#F4F4F5" />
              <strong>LangGraph</strong>
            </span>
            <span className={styles.techBrand}>
              <TavilyLogo />
              <strong>Tavily</strong>
            </span>
            <span className={styles.techBrand}>
              <BrandIcon icon={siSupabase} color="#3ECF8E" />
              <strong>Supabase</strong>
            </span>
            <span className={styles.techBrand}>
              <BrandIcon icon={siCloudflare} color="#F38020" />
              <strong>Cloudflare R2</strong>
            </span>
            <span className={styles.techBrand}>
              <BrandIcon icon={siGo} color="#00ADD8" />
              <strong>Go realtime</strong>
            </span>
            <span className={styles.techBrand}>
              <BrandIcon icon={siNextdotjs} color="#FFFFFF" />
              <strong>Next.js</strong>
            </span>
            <span className={styles.techBrand}>
              <BrandIcon icon={siFlutter} color="#54C5F8" />
              <strong>Flutter</strong>
            </span>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className={styles.ctaLines} aria-hidden="true" />
          <div className={styles.finalMark}>✦ <span>ReasonAI</span></div>
          <h2>Build Better Judgment.</h2>
          <p>Design systems. Understand ideas. Keep what you learn.</p>
          <Link href="/login" className={styles.primaryButtonLarge}>
            Start with ReasonAI <ArrowRight size={17} />
          </Link>
        </section>
      </main>
    </div>
  );
}
