import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import './CTA.css'

export default function CTA() {
  const sectionRef = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.cta-content',
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.6, scrollTrigger: { trigger: sectionRef.current, start: 'top 70%' } }
      )

      gsap.fromTo(
        '.cta-card',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.1, scrollTrigger: { trigger: '.cta-cards', start: 'top 80%' } }
      )
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} className="cta-section">
      <div className="cta-inner">
        <div className="cta-content">
          <span className="label label-green">GET STARTED</span>
          <h2 className="cta-title">
            Make any website <span className="accent-green">agent-ready</span>
          </h2>
          <p className="cta-desc">
            Join the waitlist to turn messy HTML into agent-native pages in 90 seconds.
          </p>

          {/* MailerLite embed placeholder — keep the same form ID as current site */}
          <div className="waitlist-form">
            <div className="form-row">
              <input type="email" placeholder="Email" className="form-input" />
              <input type="text" placeholder="Company" className="form-input" />
            </div>
            <button className="form-button">Join the Waitlist</button>
          </div>
        </div>

        {/* Link cards */}
        <div className="cta-cards">
          <a href="https://cerebralvalley.ai/e/nebius-build-sf/hackathon/gallery" target="_blank" rel="noopener noreferrer" className="cta-card">
            <span className="card-badge mono badge-green">1ST PLACE</span>
            <span className="card-title">Nebius.build Winner</span>
            <span className="card-desc">First place at Cerebral Valley's Nebius.build hackathon in San Francisco</span>
            <span className="card-arrow">→</span>
          </a>
          <a href="https://www.agentwebprotocol.org/" target="_blank" rel="noopener noreferrer" className="cta-card">
            <span className="card-badge mono badge-blue">PROTOCOL</span>
            <span className="card-title">Agent Web Protocol</span>
            <span className="card-desc">The open standard for declaring web surfaces agent-ready</span>
            <span className="card-arrow">→</span>
          </a>
          <a href="https://github.com/InjesterLol/injester" target="_blank" rel="noopener noreferrer" className="cta-card">
            <span className="card-badge mono badge-orange">OPEN SOURCE</span>
            <span className="card-title">GitHub</span>
            <span className="card-desc">Star the repo, explore the code, contribute to the mission</span>
            <span className="card-arrow">→</span>
          </a>
        </div>

        {/* Footer */}
        <footer className="site-footer">
          <div className="footer-line">
            Made in San Francisco &middot;{' '}
            <a href="mailto:founders@injester.com">founders@injester.com</a>
          </div>
        </footer>
      </div>
    </section>
  )
}
